"""Controller: the customer's side (the /order page on the customer's own phone).

No sign-in here. What protects the shop: a name is required, prices always come
from the database, each connection can only send so many orders, the shop can
cancel any order, and phone orders can be closed from the POS.
"""
import time

from flask import Response, jsonify, request

from ..database import get_db
from ..models import online_model

_recent = {}  # (kind, internet address) -> times of recent requests


def _ip():
    forwarded = request.headers.get('X-Forwarded-For', '').split(',')[0].strip()
    return request.headers.get('X-Real-IP') or forwarded or request.remote_addr or '?'


def _slow_down(limit=30, window=600, kind='order'):
    """Shop Wi-Fi puts many customers behind one address, so the limits are generous."""
    now, key = time.time(), (kind, _ip())
    times = [t for t in _recent.get(key, []) if now - t < window]
    times.append(now)
    _recent[key] = times
    if len(_recent) > 5000:
        _recent.clear()
    return len(times) > limit


def menu():
    response = jsonify(online_model.public_menu(get_db()))
    response.headers['Cache-Control'] = 'public, max-age=0, s-maxage=10'  # Vercel's network keeps it 10 seconds
    return response


def photo(product_id):
    found = online_model.photo(get_db(), product_id)
    if not found:
        return jsonify(error='No photo.'), 404
    content_type, data = found
    # The address changes whenever the product changes (?v=...), so it can be kept for a long time.
    return Response(data, mimetype=content_type, headers={'Cache-Control': 'public, max-age=604800, s-maxage=604800, immutable'})


def hello():
    """The customer's page says "someone is choosing right now" (at most every 20 seconds per phone)."""
    if _slow_down(limit=300, kind='hello'):
        return jsonify(ok=False), 429
    db = get_db()
    if online_model.is_open(db):
        online_model.touch_activity(db)
    return jsonify(ok=True)


def create_order():
    if _slow_down():
        return jsonify(error='Too many orders from this connection. Wait a few minutes or order at the counter.'), 429
    body = request.get_json(silent=True) or {}
    db = get_db()
    try:
        order = online_model.create(db, body)
    except online_model.Refused as e:
        return jsonify(error=str(e), **e.extra), e.status
    return jsonify(order)


def order_status(order_id):
    found = online_model.status_for_customer(get_db(), order_id, request.args.get('key'))
    if not found:
        return jsonify(error='Order not found.'), 404
    response = jsonify(found)
    response.headers['Cache-Control'] = 'no-store'
    return response
