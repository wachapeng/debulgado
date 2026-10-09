"""Model: categories, products, add-ons. When two devices edit the same row, the newest edit wins."""
import re

from . import flag, text, to_centavos, to_pesos, valid_iso

MENU_TABLES = ['categories', 'products', 'addons']
MAX_IMAGE = 200_000  # characters; the app shrinks photos to well under this


def clean_image(value):
    """A product photo is a small JPEG/PNG/WebP data URL. Anything else is dropped."""
    if not isinstance(value, str) or len(value) > MAX_IMAGE:
        return None
    if not re.match(r'^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$', value):
        return None
    return value


def _is_newer(db, table, row_id, updated_at):
    existing = db.one(f'SELECT updated_at FROM {table} WHERE id = ?', row_id)
    return existing, (existing is None or existing['updated_at'] < updated_at)


def save(db, counter, table, raw):
    """Save one row sent by a device. Returns True if it was saved."""
    if table not in MENU_TABLES or not isinstance(raw, dict):
        return False
    row_id, name, updated_at = text(raw.get('id'), 64), text(raw.get('name'), 120), valid_iso(raw.get('updated_at'))
    if not (row_id and name and updated_at):
        return False
    existing, newer = _is_newer(db, table, row_id, updated_at)
    if not newer:
        return False
    seq = counter.next()

    if table == 'categories':
        values = [name, int(raw.get('sort') or 0), flag(raw.get('active')), updated_at, seq]
        if existing:
            db.run('UPDATE categories SET name = ?, sort_order = ?, active = ?, updated_at = ?, seq = ? WHERE id = ?', *values, row_id)
        else:
            db.run('INSERT INTO categories (name, sort_order, active, updated_at, seq, id) VALUES (?, ?, ?, ?, ?, ?)', *values, row_id)

    elif table == 'products':
        category_id = text(raw.get('category_id'), 64)
        if not db.one('SELECT id FROM categories WHERE id = ?', category_id):
            return False  # its category is unknown here; skip rather than break the sync
        values = [category_id, name, to_pesos(max(0, raw.get('price') or 0)), int(raw.get('sort') or 0),
                  flag(raw.get('active')), clean_image(raw.get('image')), updated_at, seq]
        if existing:
            db.run('UPDATE products SET category_id = ?, name = ?, price = ?, sort_order = ?, active = ?, image = ?, updated_at = ?, seq = ? WHERE id = ?', *values, row_id)
        else:
            db.run('INSERT INTO products (category_id, name, price, sort_order, active, image, updated_at, seq, id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', *values, row_id)

    else:  # addons
        values = [name, to_pesos(max(0, raw.get('price') or 0)), flag(raw.get('active')), updated_at, seq]
        if existing:
            db.run('UPDATE addons SET name = ?, price = ?, active = ?, updated_at = ?, seq = ? WHERE id = ?', *values, row_id)
        else:
            db.run('INSERT INTO addons (name, price, active, updated_at, seq, id) VALUES (?, ?, ?, ?, ?, ?)', *values, row_id)
        db.run('DELETE FROM addon_categories WHERE addon_id = ?', row_id)
        for category_id in {text(c, 64) for c in (raw.get('category_ids') or []) if c}:
            if db.one('SELECT id FROM categories WHERE id = ?', category_id):
                db.run('INSERT INTO addon_categories (addon_id, category_id) VALUES (?, ?)', row_id, category_id)
    return True


def changes_since(db, table, since, upto):
    """Rows changed after a device's last sync, in the shape the app uses."""
    if table == 'categories':
        rows = db.all('SELECT id, name, sort_order, active, updated_at, seq FROM categories WHERE seq > ? AND seq <= ? ORDER BY seq', since, upto)
        return [{'id': r['id'], 'name': r['name'], 'sort': r['sort_order'], 'active': int(r['active']), 'updated_at': r['updated_at'], 'seq': r['seq']} for r in rows]
    if table == 'products':
        rows = db.all('SELECT id, category_id, name, price, sort_order, active, image, updated_at, seq FROM products WHERE seq > ? AND seq <= ? ORDER BY seq', since, upto)
        return [{'id': r['id'], 'category_id': r['category_id'], 'name': r['name'], 'price': to_centavos(r['price']), 'sort': r['sort_order'],
                 'active': int(r['active']), 'image': r['image'] or None, 'updated_at': r['updated_at'], 'seq': r['seq']} for r in rows]
    rows = db.all('SELECT id, name, price, active, updated_at, seq FROM addons WHERE seq > ? AND seq <= ? ORDER BY seq', since, upto)
    links = {}
    for link in db.all('SELECT addon_id, category_id FROM addon_categories'):
        links.setdefault(link['addon_id'], []).append(link['category_id'])
    return [{'id': r['id'], 'name': r['name'], 'price': to_centavos(r['price']), 'active': int(r['active']),
             'category_ids': sorted(links.get(r['id'], [])), 'updated_at': r['updated_at'], 'seq': r['seq']} for r in rows]
