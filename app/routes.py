"""Routes: which web address goes to which controller."""
from .controllers import (auth_controller, backup_controller, online_controller, page_controller, public_controller,
                          sync_controller)

ROUTES = [
    # address                        method   controller
    ('/',                            'GET',   page_controller.index),
    ('/sw.js',                       'GET',   page_controller.service_worker),
    ('/api/status',                  'GET',   auth_controller.status),
    ('/api/setup',                   'POST',  auth_controller.setup),
    ('/api/login',                   'POST',  auth_controller.login),
    ('/api/logout',                  'POST',  auth_controller.logout),
    ('/api/password',                'POST',  auth_controller.change_password),
    ('/api/sync',                    'POST',  sync_controller.sync),
    ('/api/backup/database.sql',     'GET',   backup_controller.download),
    # online orders on the POS (signed-in devices only)
    ('/api/online',                  'GET',   online_controller.state),
    ('/api/online/settings',         'POST',  online_controller.settings),
    ('/api/online/<order_id>/open',  'POST',  online_controller.open_order),
    ('/api/online/<order_id>/release', 'POST', online_controller.release_order),
    ('/api/online/<order_id>/cancel', 'POST', online_controller.cancel_order),
    # the customer's phone (no sign-in)
    ('/order',                       'GET',   page_controller.order_page),
    ('/api/public/menu',             'GET',   public_controller.menu),
    ('/api/public/photo/<product_id>', 'GET', public_controller.photo),
    ('/api/public/orders',           'POST',  public_controller.create_order),
    ('/api/public/orders/<order_id>', 'GET',  public_controller.order_status),
]


def register(app):
    for path, method, view in ROUTES:
        app.add_url_rule(path, endpoint=f'{view.__module__.rsplit(".", 1)[-1]}.{view.__name__}', view_func=view, methods=[method])
