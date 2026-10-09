"""Model: shop_settings table (one row: name, address, receipt footer, senior/PWD rate, manager PIN)."""
from decimal import Decimal

from . import text, valid_iso


def save(db, counter, raw):
    if not isinstance(raw, dict) or not isinstance(raw.get('data'), dict):
        return False
    updated_at = valid_iso(raw.get('updated_at'))
    if not updated_at:
        return False
    existing = db.one('SELECT updated_at FROM shop_settings WHERE id = 1')
    if existing and existing['updated_at'] >= updated_at:
        return False
    data = raw['data']
    try:
        rate = min(max(float(data.get('senior_pwd_rate', 20)), 0), 100)
    except (TypeError, ValueError):
        rate = 20.0
    pin = text(data.get('manager_pin'), 8, '')
    values = [text(data.get('shop_name'), 120, "Debulgado's Coffee Shop"), text(data.get('shop_address'), 200, ''),
              text(data.get('receipt_footer'), 200, ''), f'{rate:.2f}', pin if pin.isdigit() else '', updated_at, counter.next()]
    if existing:
        db.run('UPDATE shop_settings SET shop_name = ?, shop_address = ?, receipt_footer = ?, senior_pwd_rate = ?, manager_pin = ?, '
               'updated_at = ?, seq = ? WHERE id = 1', *values)
    else:
        db.run('INSERT INTO shop_settings (shop_name, shop_address, receipt_footer, senior_pwd_rate, manager_pin, updated_at, seq, id) '
               'VALUES (?, ?, ?, ?, ?, ?, ?, 1)', *values)
    return True


def changes_since(db, since, upto):
    r = db.one('SELECT * FROM shop_settings WHERE id = 1 AND seq > ? AND seq <= ?', since, upto)
    if not r:
        return None
    rate = Decimal(str(r['senior_pwd_rate']))
    return {'updated_at': r['updated_at'], 'data': {
        'shop_name': r['shop_name'], 'shop_address': r['shop_address'], 'receipt_footer': r['receipt_footer'],
        'senior_pwd_rate': int(rate) if rate == rate.to_integral_value() else float(rate), 'manager_pin': r['manager_pin']}}
