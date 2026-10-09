"""Debulgado's Coffee Shop POS - server.

Folder layout (Model-View-Controller):
  app/models/       read and write the database
  app/controllers/  handle each request
  app/routes.py     which address goes to which controller
  public/           the views: the app that runs in the browser / Android app
  database/         debulgado_pos.sql (the MySQL database file)
"""
from flask import Flask, jsonify, request

from . import database, routes
from .controllers.page_controller import index
from .service_worker import PUBLIC


def _short(error):
    text = str(getattr(error, 'args', [''])[-1] if getattr(error, 'args', None) else error)
    return text[:200]


def create_app():
    app = Flask(__name__, static_folder=PUBLIC, static_url_path='')
    app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024  # Vercel accepts up to 4.5 MB per request
    routes.register(app)
    app.teardown_appcontext(database.close_db)
    app.logger.info('Database: %s', database.describe())

    @app.before_request
    def database_ready():
        if not request.path.startswith('/api/'):
            return None
        try:
            database.ensure_schema()  # creates the tables the very first time
        except database.DatabaseNotConfigured as e:
            return jsonify(error=str(e), database_missing=True), 503
        except Exception as e:  # wrong password, server unreachable, ...
            app.logger.exception('Database problem')
            return jsonify(error=f"The server can't use its database: {_short(e)}", database_error=True), 503
        return None

    @app.after_request
    def headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        if request.path.startswith('/api/public/') and 'Cache-Control' in response.headers:
            pass  # the customer's menu and product photos set their own caching
        elif request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store'
        elif 'Cache-Control' not in response.headers or request.path == '/':
            response.headers['Cache-Control'] = 'no-cache'  # always check for a newer app version
        return response

    @app.errorhandler(500)
    def server_error(error):
        if request.path.startswith('/api/'):
            cause = getattr(error, 'original_exception', None)
            detail = f' ({_short(cause)})' if cause else ''
            return jsonify(error=f'The server ran into a problem{detail}. Check the logs in Vercel.'), 500
        return 'The server ran into a problem.', 500

    @app.errorhandler(404)
    def not_found(_error):
        if request.path.startswith('/api/'):
            return jsonify(error='Not found.'), 404
        if '.' not in request.path.rsplit('/', 1)[-1]:
            return index()  # any page address opens the app
        return 'Not found.', 404

    return app
