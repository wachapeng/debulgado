"""Controller: online orders on the POS (the list under the order ticket, the QR codes)."""
from flask import g, jsonify, request

from ..database import get_db
from ..models import online_model
from .auth_controller import device_required


def _state(db):
    orders = online_model.waiting(db)
    for o in orders:
        o['opened_here'] = o['opened_by'] == g.device['id']
    return {'open': online_model.is_open(db), 'code': online_model.counter_code(db), 'orders': orders,
            'activity_age': online_model.activity_age(db)}


def _refused(e):
    return jsonify(error=str(e), **e.extra), e.status


@device_required
def state():
    """Asked every few seconds by the POS: waiting orders, open or closed, and the counter code."""
    return jsonify(_state(get_db()))


@device_required
def settings():
    body = request.get_json(silent=True) or {}
    db = get_db()
    if 'open' in body:
        online_model.set_open(db, bool(body['open']))
    if body.get('new_code'):
        online_model.new_counter_code(db)
    return jsonify(_state(db))


@device_required
def open_order(order_id):
    body = request.get_json(silent=True) or {}
    try:
        order = online_model.open_on(get_db(), order_id, g.device, force=bool(body.get('force')))
        return jsonify({**order, 'opened_here': True})
    except online_model.Refused as e:
        return _refused(e)


@device_required
def release_order(order_id):
    online_model.release(get_db(), order_id, g.device)
    return jsonify(ok=True)


@device_required
def cancel_order(order_id):
    try:
        online_model.cancel(get_db(), order_id)
    except online_model.Refused as e:
        return _refused(e)
    return jsonify(ok=True)
