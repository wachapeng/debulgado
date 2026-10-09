"""Controller: one round of syncing.

A device uploads what changed on it (new orders, voids, menu and shop edits), then
downloads everything that changed on the server since its last sync.
"""
from flask import current_app, g, jsonify, request

from ..database import get_db
from ..models import device_model, menu_model, now_iso, order_model, settings_model, shop_model
from .auth_controller import device_required

PAGE = 1000  # orders per download; the device keeps asking until it has them all
PHOTO_BUDGET = 2_500_000  # characters of product photos per download (Vercel allows 4.5 MB per response)


@device_required
def sync():
    body = request.get_json(silent=True) or {}
    try:
        since = max(0, int(body.get('since') or 0))
    except (TypeError, ValueError):
        since = 0
    push = body.get('push') if isinstance(body.get('push'), dict) else {}
    result = {'orders': {'new': 0, 'updated': 0, 'skipped': 0}, 'menu': 0, 'shop': False}
    db = get_db()

    with db.transaction():
        counter = settings_model.ChangeCounter(db)
        for table in menu_model.MENU_TABLES:            # menu first, so new products exist before orders
            for row in push.get(table) or []:
                if menu_model.save(db, counter, table, row):
                    result['menu'] += 1
        if push.get('shop'):
            result['shop'] = shop_model.save(db, counter, push['shop'])
        orders = push.get('orders') or []
        known = order_model.known_versions(db, orders)
        for order in orders:
            try:
                with db.savepoint():
                    result['orders'][order_model.save(db, counter, order, known)] += 1
            except Exception:  # one bad order must not block the others
                current_app.logger.exception('Order %s could not be saved', order.get('id') if isinstance(order, dict) else '?')
                result['orders']['skipped'] += 1
        counter.save()
        device_model.touch(db, g.device['id'], body.get('device'))

    # Read the counter first, then rows up to it, so nothing saved meanwhile is skipped.
    upto = settings_model.current_seq(db)
    orders = order_model.changes_since(db, since, upto, PAGE)
    more = len(orders) == PAGE
    pull = {'orders': orders, 'shop': shop_model.changes_since(db, since, upto)}
    for table in menu_model.MENU_TABLES:
        pull[table] = menu_model.changes_since(db, table, since, upto)

    cursor = orders[-1]['seq'] if more else upto
    # Many product photos: send some now, the rest in the next round (the device keeps asking while more=True).
    size, kept = 0, []
    for row in pull['products']:
        size += len(row.get('image') or '')
        if kept and size > PHOTO_BUDGET:
            cursor, more = min(cursor, kept[-1]['seq']), True
            break
        kept.append(row)
    pull['products'] = kept

    return jsonify(cursor=cursor, more=more, pull=pull, result=result,
                   device={'name': g.device['name'], 'prefix': g.device['prefix']}, server_time=now_iso())
