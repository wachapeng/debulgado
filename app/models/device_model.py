"""Model: devices table. Each signed-in laptop or phone has a secret token and a receipt prefix."""
import hashlib
import secrets

from . import now_local, text


def _hash(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def _free_prefix(db, name):
    """First letter of the device name (L for Laptop), or L2, L3... if already taken. Never reused."""
    used = {r['prefix'] for r in db.all('SELECT prefix FROM devices')}
    letters = [c for c in name.upper() if 'A' <= c <= 'Z'] or ['D']
    first = letters[0]
    for candidate in [first] + [f'{first}{n}' for n in range(2, 1000)]:
        if candidate not in used:
            return candidate
    return secrets.token_hex(2).upper()


def create(db, name):
    """Sign in a new device. Returns its token (shown to the device once) and receipt prefix."""
    name = text(name, 60, 'Device')
    with db.transaction():
        prefix = _free_prefix(db, name)
        token = secrets.token_urlsafe(32)
        db.run('INSERT INTO devices (name, prefix, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
               name, prefix, _hash(token), now_local(), now_local())
    return {'token': token, 'prefix': prefix, 'device_name': name}


def find_by_token(db, token):
    if not token:
        return None
    return db.one('SELECT id, name, prefix FROM devices WHERE token_hash = ? AND signed_out_at IS NULL', _hash(token))


def touch(db, device_id, name=None):
    db.run('UPDATE devices SET last_seen = ?, name = COALESCE(?, name) WHERE id = ?', now_local(), text(name, 60), device_id)


def sign_out(db, device_id):
    db.run('UPDATE devices SET signed_out_at = ? WHERE id = ?', now_local(), device_id)


def sign_out_others(db, keep_id):
    db.run('UPDATE devices SET signed_out_at = ? WHERE id <> ? AND signed_out_at IS NULL', now_local(), keep_id)
