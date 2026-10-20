"""Model: inventory (stock items, recipes and stock moves).

Every change to the stock is a "move" with its own id, so changes made on several devices
(even offline) add up correctly and are never counted twice:
  start / receive / count / waste - made on a device by the cashier or owner;
  sale / void - made here, from the recipes, when a sale (or its void) reaches the server.
stock_items.quantity is kept equal to the sum of the item's moves.
"""
from decimal import Decimal, InvalidOperation

from . import maybe_pesos, text, to_centavos, valid_iso

DEVICE_REASONS = {'start', 'receive', 'count', 'waste'}
MAX_QTY = Decimal('99999999')
MAX_RECIPE_LINES = 30


def quantity(value):
    """A quantity from a device (number or text) -> Decimal with 3 decimals, or None."""
    try:
        q = Decimal(str(value)).quantize(Decimal('0.001'))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not q.is_finite() or abs(q) > MAX_QTY:
        return None
    return q


def _num(value):
    return float(value) if value is not None else None


def _bump(db, counter, item_id, change):
    """Add to an item's stock, and give it a new change number so devices download it."""
    db.run('UPDATE stock_items SET quantity = quantity + ?, seq = ? WHERE id = ?', str(change), counter.next(), item_id)


# ---------- items ----------

def save_item(db, counter, raw):
    """Save one stock item sent by a device (newest edit wins). The quantity is never taken from
    the device: it only changes through moves."""
    if not isinstance(raw, dict):
        return False
    item_id, name, updated_at = text(raw.get('id'), 64), text(raw.get('name'), 120), valid_iso(raw.get('updated_at'))
    if not (item_id and name and updated_at):
        return False
    existing = db.one('SELECT updated_at FROM stock_items WHERE id = ?', item_id)
    if existing and existing['updated_at'] >= updated_at:
        return False
    low = quantity(raw.get('low_level')) or Decimal('0')
    values = [name, text(raw.get('barcode'), 64), text(raw.get('unit'), 16, 'pcs'), str(max(low, Decimal('0'))),
              maybe_pesos(raw.get('cost')), 0 if raw.get('active') in (0, False, '0') else 1, updated_at, counter.next()]
    if existing:
        db.run('UPDATE stock_items SET name = ?, barcode = ?, unit = ?, low_level = ?, cost = ?, active = ?, updated_at = ?, seq = ? WHERE id = ?',
               *values, item_id)
    else:
        db.run('INSERT INTO stock_items (name, barcode, unit, low_level, cost, active, updated_at, seq, id, quantity) '
               'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)', *values, item_id)
    return True


def changes_since(db, since, upto):
    rows = db.all('SELECT * FROM stock_items WHERE seq > ? AND seq <= ? ORDER BY seq', since, upto)
    return [{'id': r['id'], 'name': r['name'], 'barcode': r['barcode'], 'unit': r['unit'], 'quantity': _num(r['quantity']),
             'low_level': _num(r['low_level']), 'cost': to_centavos(r['cost']), 'active': int(r['active']),
             'updated_at': r['updated_at'], 'seq': r['seq']} for r in rows]


# ---------- moves made on a device ----------

def save_move(db, counter, raw, device_name=None):
    """A delivery received, a count or waste, made on a device. Saved once, whatever happens to the connection."""
    if not isinstance(raw, dict):
        return False
    move_id, item_id = text(raw.get('id'), 160), text(raw.get('item_id'), 64)
    change, reason, created_at = quantity(raw.get('change')), raw.get('reason'), valid_iso(raw.get('created_at'))
    if not (move_id and item_id and change is not None and reason in DEVICE_REASONS and created_at):
        return False
    if change == 0 and reason != 'count':
        return False
    if db.one('SELECT id FROM stock_moves WHERE id = ?', move_id) or not db.one('SELECT id FROM stock_items WHERE id = ?', item_id):
        return False
    db.run('INSERT INTO stock_moves (id, item_id, change_qty, reason, order_id, note, device_name, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)',
           move_id, item_id, str(change), reason, text(raw.get('note'), 200), text(device_name, 60), created_at)
    _bump(db, counter, item_id, change)
    return True


# ---------- recipes ----------

def save_recipe(db, owner_id, recipe):
    """Replace what one product or add-on uses. recipe: [{item_id, qty}] (None: leave it as it is)."""
    if recipe is None or not isinstance(recipe, list):
        return
    db.run('DELETE FROM recipe_lines WHERE owner_id = ?', owner_id)
    seen = set()
    for line in recipe[:MAX_RECIPE_LINES]:
        if not isinstance(line, dict):
            continue
        item_id, qty = text(line.get('item_id'), 64), quantity(line.get('qty'))
        if not item_id or item_id in seen or qty is None or qty <= 0:
            continue
        if not db.one('SELECT id FROM stock_items WHERE id = ?', item_id):
            continue
        seen.add(item_id)
        db.run('INSERT INTO recipe_lines (owner_id, item_id, qty) VALUES (?, ?, ?)', owner_id, item_id, str(qty))


def recipes_for(db, owner_ids):
    ids = list(owner_ids)
    out = {i: [] for i in ids}
    for start in range(0, len(ids), 500):
        chunk = ids[start:start + 500]
        if not chunk:
            continue
        for r in db.all(f"SELECT owner_id, item_id, qty FROM recipe_lines WHERE owner_id IN ({', '.join('?' * len(chunk))}) ORDER BY item_id", *chunk):
            out[r['owner_id']].append({'item_id': r['item_id'], 'qty': _num(r['qty'])})
    return out


# ---------- sales and voids ----------

def take_for_sale(db, counter, order_id, items, created_at, device_name=None):
    """A paid sale reached the server: take its ingredients off the stock (from the recipes as they are now)."""
    use = {}
    owners = set()
    for item in items:
        if isinstance(item, dict):
            owners.add(text(item.get('product_id'), 64))
            owners.update(text(a.get('id'), 64) for a in (item.get('addons') or []) if isinstance(a, dict))
    owners.discard(None)
    if not owners:
        return
    recipes = recipes_for(db, owners)
    for item in items:
        if not isinstance(item, dict):
            continue
        servings = Decimal(max(1, int(item.get('qty') or 1)))
        for owner in [text(item.get('product_id'), 64)] + [text(a.get('id'), 64) for a in (item.get('addons') or []) if isinstance(a, dict)]:
            for line in recipes.get(owner, []):
                use[line['item_id']] = use.get(line['item_id'], Decimal('0')) + Decimal(str(line['qty'])) * servings
    for item_id, amount in sorted(use.items()):
        move_id = f'{order_id}|{item_id}|sale'
        if db.one('SELECT id FROM stock_moves WHERE id = ?', move_id):
            continue
        db.run("INSERT INTO stock_moves (id, item_id, change_qty, reason, order_id, note, device_name, created_at) VALUES (?, ?, ?, 'sale', ?, NULL, ?, ?)",
               move_id, item_id, str(-amount), order_id, text(device_name, 60), created_at)
        _bump(db, counter, item_id, -amount)


def put_back_for_void(db, counter, order_id, created_at, device_name=None):
    """A sale was voided: put back exactly what it took."""
    for r in db.all("SELECT item_id, SUM(change_qty) AS used FROM stock_moves WHERE order_id = ? AND reason = 'sale' GROUP BY item_id", order_id):
        move_id = f"{order_id}|{r['item_id']}|void"
        back = -Decimal(str(r['used']))
        if back == 0 or db.one('SELECT id FROM stock_moves WHERE id = ?', move_id):
            continue
        db.run("INSERT INTO stock_moves (id, item_id, change_qty, reason, order_id, note, device_name, created_at) VALUES (?, ?, ?, 'void', ?, NULL, ?, ?)",
               move_id, r['item_id'], str(back), order_id, text(device_name, 60), created_at)
        _bump(db, counter, r['item_id'], back)


# ---------- history ----------

def history(db, item_id, limit=100):
    rows = db.all('SELECT m.change_qty, m.reason, m.note, m.device_name, m.created_at, o.order_no FROM stock_moves m '
                  'LEFT JOIN orders o ON o.id = m.order_id WHERE m.item_id = ? ORDER BY m.created_at DESC LIMIT ?', text(item_id, 64), limit)
    return [{'change': _num(r['change_qty']), 'reason': r['reason'], 'note': r['note'], 'device': r['device_name'],
             'created_at': r['created_at'], 'order_no': r['order_no']} for r in rows]
