"""Controller: the app's pages (the View files live in the public/ folder).

On Vercel, files in public/ are served directly by Vercel. The service worker
(/sw.js) is always made here, so it can list the current app files.
"""
from flask import Response, send_from_directory

from ..service_worker import PUBLIC, render

_service_worker = None


def index():
    return send_from_directory(PUBLIC, 'index.html')


def order_page():
    """The customer's ordering page (opened from the order QR code)."""
    return send_from_directory(PUBLIC, 'order.html')


def service_worker():
    global _service_worker
    if _service_worker is None:
        _service_worker = render()[0]
    return Response(_service_worker, mimetype='application/javascript', headers={'Cache-Control': 'no-cache'})
