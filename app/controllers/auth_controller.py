"""Controller: shop password and device sign-in.

The first person to open a new server creates the shop password. After that,
each laptop or phone signs in once with that password and keeps a device key.
"""
import time
from functools import wraps

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from ..database import get_db
from ..models import device_model, now_iso, settings_model

MIN_PASSWORD = 6
_failures = {}  # ip address -> times of recent wrong passwords


def _ip():
    return request.headers.get('X-Real-IP') or request.remote_addr or '?'


def _too_many_attempts():
    now = time.time()
    recent = [t for t in _failures.get(_ip(), []) if now - t < 600]
    _failures[_ip()] = recent
    return len(recent) >= 8


def _hash(password):
    return generate_password_hash(password, method='pbkdf2:sha256')


def device_required(view):
    """Only signed-in devices may use this request."""
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = request.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        device = device_model.find_by_token(get_db(), token)
        if not device:
            return jsonify(error='This device is signed out. Enter the shop password to sign in again.', signed_out=True), 401
        g.device = device
        return view(*args, **kwargs)
    return wrapper


def status():
    db = get_db()
    return jsonify(ok=True, app='debulgado-pos', needs_setup=not settings_model.get(db, 'shop_password_hash'), server_time=now_iso())


def setup():
    """First visit to a new server: create the shop password and sign in this device."""
    body = request.get_json(silent=True) or {}
    password = str(body.get('password') or '')
    if len(password) < MIN_PASSWORD:
        return jsonify(error=f'Use at least {MIN_PASSWORD} characters for the shop password.'), 400
    db = get_db()
    with db.transaction():
        row = db.one("SELECT setting_value AS v FROM app_settings WHERE setting_key = 'shop_password_hash'" + db.for_update)
        if row and row['v']:
            return jsonify(error='This shop is already set up. Sign in with the shop password.', needs_setup=False), 409
        settings_model.put(db, 'shop_password_hash', _hash(password))
        device = device_model.create(db, body.get('device_name'))
    return jsonify(device)


def login():
    if _too_many_attempts():
        return jsonify(error='Too many wrong passwords. Wait 10 minutes and try again.'), 429
    body = request.get_json(silent=True) or {}
    db = get_db()
    stored = settings_model.get(db, 'shop_password_hash')
    if not stored:
        return jsonify(error='This shop is not set up yet.', needs_setup=True), 409
    if not check_password_hash(stored, str(body.get('password') or '')):
        _failures.setdefault(_ip(), []).append(time.time())
        return jsonify(error='That password is not right.'), 401
    return jsonify(device_model.create(db, body.get('device_name')))


@device_required
def logout():
    device_model.sign_out(get_db(), g.device['id'])
    return jsonify(ok=True)


@device_required
def change_password():
    if _too_many_attempts():
        return jsonify(error='Too many wrong passwords. Wait 10 minutes and try again.'), 429
    body = request.get_json(silent=True) or {}
    db = get_db()
    if not check_password_hash(settings_model.get(db, 'shop_password_hash'), str(body.get('current') or '')):
        _failures.setdefault(_ip(), []).append(time.time())
        return jsonify(error='The current password is not right.'), 400
    new = str(body.get('new') or '')
    if len(new) < MIN_PASSWORD:
        return jsonify(error=f'Use at least {MIN_PASSWORD} characters for the new password.'), 400
    with db.transaction():
        settings_model.put(db, 'shop_password_hash', _hash(new))
        device_model.sign_out_others(db, g.device['id'])
    return jsonify(ok=True)
