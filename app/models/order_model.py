"""Model: orders, order_items, order_item_addons.

An order is saved once. A later upload of the same order can only change its
status (a void), and only if it is newer.
"""
from . import maybe_pesos, now_local, text, to_centavos, to_pesos, valid_datetime, valid_iso
from . import online_model


def known_versions(db, orders):
    """updated_at of the orders the server already has, looked up in one query."""
    ids = [text(o.get('id'), 64) for o in orders if isinstance(o, dict) and o.get('id')]
    known = {}
    for start in range(0, len(ids), 500):
        chunk = ids[start:start + 500]
        for r in db.all(f'SELECT id, updated_at FROM orders WHERE id IN ({_in_list(len(chunk))})', *chunk):
            known[r['id']] = r['updated_at']
    return known


def save(db, counter, o, known=None):
    """Save one order sent by a device. Returns 'new', 'updated' or 'skipped'.
    known: result of known_versions() for the whole upload (saves one query per order)."""
    if not isinstance(o, dict) or not isinstance(o.get('items'), list) or not o['items']:
        return 'skipped'
    order_id, updated_at = text(o.get('id'), 64), valid_iso(o.get('updated_at'))
    created_at = valid_datetime(o.get('created_at'))
    if not (order_id and updated_at and created_at):
        return 'skipped'
    status = 'void' if o.get('status') == 'void' else 'paid'

    if known is None:
        row = db.one('SELECT updated_at FROM orders WHERE id = ?', order_id)
        existing = row['updated_at'] if row else None
    else:
        existing = known.get(order_id)
    if existing:
        if existing >= updated_at:
            return 'skipped'
        db.run('UPDATE orders SET status = ?, void_reason = ?, voided_at = ?, updated_at = ?, seq = ? WHERE id = ?',
               status, text(o.get('void_reason'), 300), valid_datetime(o.get('voided_at')), updated_at, counter.next(), order_id)
        if known is not None:
            known[order_id] = updated_at
        return 'updated'

    cash = o.get('payment_method') != 'gcash'
    online_id = text(o.get('online_order_id'), 64)
    db.run('INSERT INTO orders (id, order_no, device_name, cashier, created_at, order_date, service, subtotal, discount, discount_label, '
           'total, payment_method, amount_tendered, change_due, gcash_ref, customer_name, online_order_id, '
           'status, void_reason, voided_at, updated_at, received_at, seq) '
           'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
           order_id, text(o.get('number'), 20, '?'), text(o.get('device'), 60), text(o.get('cashier'), 60), created_at, created_at[:10],
           'take-out' if o.get('service') == 'take-out' else 'dine-in', to_pesos(o.get('subtotal')), to_pesos(o.get('discount')),
           text(o.get('discount_label'), 60), to_pesos(o.get('total')), 'cash' if cash else 'gcash',
           maybe_pesos(o.get('tendered')) if cash else None, maybe_pesos(o.get('change_due')) if cash else None,
           None if cash else text(o.get('payment_ref'), 60), text(o.get('customer_name'), 60), online_id,
           status, text(o.get('void_reason'), 300),
           valid_datetime(o.get('voided_at')), updated_at, now_local(), counter.next())

    for line_no, item in enumerate(o['items'], start=1):
        if not isinstance(item, dict):
            continue
        item_id = db.run('INSERT INTO order_items (order_id, line_no, product_id, product_name, category, unit_price, qty, line_total) '
                         'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                         order_id, line_no, text(item.get('product_id'), 64), text(item.get('name'), 120, '?'), text(item.get('category'), 120),
                         to_pesos(item.get('price')), max(1, int(item.get('qty') or 1)), to_pesos(item.get('line_total')))
        db.run_many('INSERT INTO order_item_addons (order_item_id, addon_id, addon_name, price) VALUES (?, ?, ?, ?)',
                    [(item_id, text(a.get('id'), 64), text(a.get('name'), 120, '?'), to_pesos(a.get('price')))
                     for a in (item.get('addons') or []) if isinstance(a, dict)])
    if online_id:
        online_model.mark_paid(db, online_id, order_id)  # the customer's phone now shows "Paid"
    if known is not None:
        known[order_id] = updated_at
    return 'new'


def _in_list(n):
    return ', '.join('?' * n)


def changes_since(db, since, upto, limit):
    """Orders changed after a device's last sync (oldest change first), in the shape the app uses."""
    rows = db.all('SELECT * FROM orders WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT ?', since, upto, limit)
    if not rows:
        return []
    ids = [r['id'] for r in rows]
    items = db.all(f'SELECT * FROM order_items WHERE order_id IN ({_in_list(len(ids))}) ORDER BY order_id, line_no', *ids)
    addons = {}
    if items:
        item_ids = [i['id'] for i in items]
        for a in db.all(f'SELECT * FROM order_item_addons WHERE order_item_id IN ({_in_list(len(item_ids))}) ORDER BY id', *item_ids):
            addons.setdefault(a['order_item_id'], []).append({'id': a['addon_id'], 'name': a['addon_name'], 'price': to_centavos(a['price'])})
    by_order = {}
    for i in items:
        by_order.setdefault(i['order_id'], []).append({
            'product_id': i['product_id'], 'name': i['product_name'], 'category': i['category'], 'price': to_centavos(i['unit_price']),
            'qty': i['qty'], 'addons': addons.get(i['id'], []), 'line_total': to_centavos(i['line_total'])})
    return [{
        'id': r['id'], 'number': r['order_no'], 'device': r['device_name'], 'cashier': r['cashier'],
        'created_at': r['created_at'], 'date': r['order_date'], 'service': r['service'],
        'subtotal': to_centavos(r['subtotal']), 'discount': to_centavos(r['discount']), 'discount_label': r['discount_label'],
        'total': to_centavos(r['total']), 'payment_method': r['payment_method'],
        'tendered': to_centavos(r['amount_tendered']), 'change_due': to_centavos(r['change_due']), 'payment_ref': r['gcash_ref'],
        'customer_name': r.get('customer_name'), 'online_order_id': r.get('online_order_id'),
        'status': r['status'], 'void_reason': r['void_reason'], 'voided_at': r['voided_at'],
        'updated_at': r['updated_at'], 'seq': r['seq'], 'items': by_order.get(r['id'], []),
    } for r in rows]
