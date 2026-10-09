"""Model: online orders, the ones customers send from their own phones (the /order page).

A customer chooses items, gives a name, and taps Send order.
The order waits here until a cashier opens it on the POS and takes payment; the sale is
then saved like any other (orders table) and this row is marked paid.
"""
import base64
import datetime
import hashlib
import json
import re
import secrets
import uuid

from . import now_iso, text, to_centavos, to_pesos
from . import settings_model

MAX_LINES = 30        # different items in one order
MAX_QTY = 20          # of one item
SHOW_HOURS = 12       # the POS lists waiting orders from the last 12 hours
KEEP_DAYS = 30        # online orders older than this are deleted (the sales themselves stay)
BUSY_LIMIT = 60       # waiting orders in the last hour before new ones are refused


class Refused(Exception):
    """An order or action that can't go ahead. message is shown to the person."""

    def __init__(self, message, status=400, **extra):
        super().__init__(message)
        self.status, self.extra = status, extra


def _iso_hours_ago(hours):
    t = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    return t.strftime('%Y-%m-%dT%H:%M:%S.000Z')


# ---------- settings: open / closed ----------

def is_open(db):
    return settings_model.get(db, 'online_open', '1') != '0'


def set_open(db, value):
    settings_model.put(db, 'online_open', '1' if value else '0')


def touch_activity(db):
    """A customer is choosing on their phone right now. The POS then checks for new orders every
    2 seconds, so the order shows up almost at once (and stays light on requests the rest of the time)."""
    settings_model.put(db, 'customer_activity', now_iso())


def activity_age(db):
    """Seconds since a customer last did something on the order page (None: not today)."""
    last = settings_model.get(db, 'customer_activity')
    try:
        then = datetime.datetime.strptime(last, '%Y-%m-%dT%H:%M:%S.%fZ').replace(tzinfo=datetime.timezone.utc)
    except (TypeError, ValueError):
        return None
    age = (datetime.datetime.now(datetime.timezone.utc) - then).total_seconds()
    return round(age) if age < 86400 else None


# ---------- what the customer's phone sees ----------

def public_menu(db):
    categories = db.all('SELECT id, name FROM categories WHERE active = 1 ORDER BY sort_order, name')
    shown = {c['id']: i for i, c in enumerate(categories)}  # category -> its place on the menu
    products = []
    for p in db.all('SELECT id, category_id, name, price, sort_order, image IS NOT NULL AS has_image, updated_at '
                    'FROM products WHERE active = 1 ORDER BY sort_order, name'):
        if p['category_id'] not in shown:
            continue
        version = hashlib.sha1(str(p['updated_at']).encode()).hexdigest()[:10]
        products.append({'id': p['id'], 'category_id': p['category_id'], 'name': p['name'], 'price': to_centavos(p['price']),
                         'image': f"/api/public/photo/{p['id']}?v={version}" if p['has_image'] else None,
                         '_rank': (shown[p['category_id']], p['sort_order'], p['name'])})
    products.sort(key=lambda p: p.pop('_rank'))  # by category, then by place within it, like the POS
    links = {}
    for link in db.all('SELECT addon_id, category_id FROM addon_categories'):
        if link['category_id'] in shown:
            links.setdefault(link['addon_id'], []).append(link['category_id'])
    addons = [{'id': a['id'], 'name': a['name'], 'price': to_centavos(a['price']), 'category_ids': sorted(links.get(a['id'], []))}
              for a in db.all('SELECT id, name, price FROM addons WHERE active = 1 ORDER BY name')]
    shop = db.one('SELECT shop_name, shop_address FROM shop_settings WHERE id = 1') or {}
    return {'open': is_open(db), 'shop': {'name': shop.get('shop_name') or 'Coffee shop', 'address': shop.get('shop_address') or ''},
            'categories': categories, 'products': products, 'addons': [a for a in addons if a['category_ids']]}


def photo(db, product_id):
    """(content type, bytes) of a product photo, or None."""
    row = db.one('SELECT image FROM products WHERE id = ?', product_id)
    found = re.match(r'^data:(image/(?:jpeg|png|webp));base64,(.+)$', (row or {}).get('image') or '')
    if not found:
        return None
    return found.group(1), base64.b64decode(found.group(2))


def _priced_items(db, raw_items):
    """Check the customer's items against the menu and price them from the database (never trust the phone's prices)."""
    if not isinstance(raw_items, list) or not raw_items:
        raise Refused('Your order is empty. Add something first.')
    if len(raw_items) > MAX_LINES:
        raise Refused(f'That is a lot of items. Please order up to {MAX_LINES} different items at a time.')
    products = {p['id']: p for p in db.all(
        'SELECT p.id, p.name, p.price, p.category_id, c.name AS category FROM products p '
        'JOIN categories c ON c.id = p.category_id WHERE p.active = 1 AND c.active = 1')}
    addons = {a['id']: a for a in db.all('SELECT id, name, price FROM addons WHERE active = 1')}
    allowed = {(r['addon_id'], r['category_id']) for r in db.all('SELECT addon_id, category_id FROM addon_categories')}
    changed = Refused('The menu just changed. Check your order and try again.', 409, menu_changed=True)

    merged = {}
    for raw in raw_items:
        if not isinstance(raw, dict):
            raise changed
        product = products.get(text(raw.get('product_id'), 64))
        try:
            qty = int(raw.get('qty'))
        except (TypeError, ValueError):
            qty = 0
        if not product or not 1 <= qty <= MAX_QTY:
            raise changed if not product else Refused(f'Please order up to {MAX_QTY} of each item.')
        addon_ids = list(dict.fromkeys(text(a, 64) for a in (raw.get('addon_ids') or []) if a))
        chosen = []
        for aid in addon_ids:
            if aid not in addons or (aid, product['category_id']) not in allowed:
                raise changed
            chosen.append(addons[aid])
        key = (product['id'], tuple(sorted(addon_ids)))
        if key in merged:
            merged[key]['qty'] = min(MAX_QTY, merged[key]['qty'] + qty)
            continue
        merged[key] = {'product': product, 'qty': qty, 'addons': chosen}

    items = []
    for line in merged.values():
        p, price = line['product'], to_centavos(line['product']['price'])
        extras = [{'id': a['id'], 'name': a['name'], 'price': to_centavos(a['price'])} for a in line['addons']]
        unit = price + sum(a['price'] for a in extras)
        items.append({'product_id': p['id'], 'name': p['name'], 'category': p['category'], 'price': price,
                      'qty': line['qty'], 'addons': extras, 'line_total': unit * line['qty']})
    return items


def create(db, body):
    """A customer sends an order. Returns what the customer's phone keeps (including its secret)."""
    order_id = str(body.get('id') or '')
    if not re.match(r'^[A-Za-z0-9-]{8,64}$', order_id):
        order_id = str(uuid.uuid4())
    existing = db.one('SELECT * FROM online_orders WHERE id = ?', order_id)
    if existing:  # the phone sent it again (for example after a dropped connection)
        return customer_view(existing, with_secret=True)

    if not is_open(db):
        raise Refused('The shop is not taking phone orders right now. Please order at the counter.', 403, closed=True)
    name = re.sub(r'\s+', ' ', str(body.get('name') or '')).strip()[:40]
    if not name:
        raise Refused('Enter your name, so the cashier knows whose order it is.', 400, need_name=True)
    items = _priced_items(db, body.get('items'))
    busy = db.one("SELECT COUNT(*) AS n FROM online_orders WHERE status = 'waiting' AND created_at >= ?", _iso_hours_ago(1))['n']
    if busy >= BUSY_LIMIT:
        raise Refused('The shop has a lot of orders waiting. Please order at the counter.', 429)

    now = now_iso()
    db.run('DELETE FROM online_orders WHERE created_at < ?', _iso_hours_ago(24 * KEEP_DAYS))
    touch_activity(db)  # more orders often follow (a group ordering one by one)
    db.run('INSERT INTO online_orders (id, secret, customer_name, service, items, item_count, total, status, created_at, updated_at) '
           "VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?)",
           order_id, secrets.token_hex(16), name, 'take-out' if body.get('service') == 'take-out' else 'dine-in',
           json.dumps(items, ensure_ascii=False), sum(i['qty'] for i in items), to_pesos(sum(i['line_total'] for i in items)), now, now)
    return customer_view(db.one('SELECT * FROM online_orders WHERE id = ?', order_id), with_secret=True)


def customer_view(row, with_secret=False, receipt_no=None):
    view = {'id': row['id'], 'name': row['customer_name'], 'service': row['service'], 'items': json.loads(row['items']),
            'item_count': row['item_count'], 'total': to_centavos(row['total']), 'status': row['status'],
            'at_counter': bool(row.get('opened_by')) and row['status'] == 'waiting',
            'receipt_no': receipt_no, 'created_at': row['created_at']}
    if with_secret:
        view['secret'] = row['secret']
    return view


def status_for_customer(db, order_id, secret):
    row = db.one('SELECT * FROM online_orders WHERE id = ?', text(order_id, 64))
    if not row or not secrets.compare_digest(str(secret or ''), row['secret']):
        return None
    sale = db.one('SELECT order_no FROM orders WHERE id = ?', row['order_id']) if row['order_id'] else None
    return customer_view(row, receipt_no=sale['order_no'] if sale else None)


# ---------- what the POS sees and does ----------

def _pos_view(row):
    return {'id': row['id'], 'name': row['customer_name'], 'service': row['service'], 'items': json.loads(row['items']),
            'item_count': row['item_count'], 'total': to_centavos(row['total']), 'status': row['status'],
            'opened_by': row['opened_by'], 'opened_by_name': row['opened_by_name'], 'created_at': row['created_at']}


def waiting(db):
    rows = db.all("SELECT * FROM online_orders WHERE status = 'waiting' AND created_at >= ? ORDER BY created_at",
                  _iso_hours_ago(SHOW_HOURS))
    return [_pos_view(r) for r in rows]


def _locked(db, order_id):
    row = db.one('SELECT * FROM online_orders WHERE id = ?' + db.for_update, text(order_id, 64))
    if not row:
        raise Refused('That online order is no longer there.', 404, gone=True)
    if row['status'] == 'paid':
        raise Refused(f"{row['customer_name']}'s order is already paid.", 409, gone=True)
    if row['status'] == 'cancelled':
        raise Refused(f"{row['customer_name']}'s order was cancelled.", 409, gone=True)
    return row


def open_on(db, order_id, device, force=False):
    """A cashier opens the order in the ticket. Another device can take it over only when asked to (force)."""
    with db.transaction():
        row = _locked(db, order_id)
        if row['opened_by'] and row['opened_by'] != device['id'] and not force:
            raise Refused(f"{row['customer_name']}'s order is open on {row['opened_by_name']}.", 409,
                          opened_elsewhere=True, opened_by_name=row['opened_by_name'])
        db.run('UPDATE online_orders SET opened_by = ?, opened_by_name = ?, updated_at = ? WHERE id = ?',
               device['id'], device['name'], now_iso(), row['id'])
        row.update(opened_by=device['id'], opened_by_name=device['name'])
    return _pos_view(row)


def release(db, order_id, device):
    """The cashier put the order back (cleared the ticket without paying)."""
    db.run("UPDATE online_orders SET opened_by = NULL, opened_by_name = NULL, updated_at = ? "
           "WHERE id = ? AND opened_by = ? AND status = 'waiting'", now_iso(), text(order_id, 64), device['id'])


def cancel(db, order_id):
    with db.transaction():
        row = _locked(db, order_id)
        db.run("UPDATE online_orders SET status = 'cancelled', opened_by = NULL, opened_by_name = NULL, updated_at = ? WHERE id = ?",
               now_iso(), row['id'])


def mark_paid(db, online_order_id, order_id):
    """Called when the sale made from this online order reaches the server."""
    db.run("UPDATE online_orders SET status = 'paid', order_id = ?, opened_by = NULL, opened_by_name = NULL, updated_at = ? WHERE id = ?",
           order_id, now_iso(), text(online_order_id, 64))
