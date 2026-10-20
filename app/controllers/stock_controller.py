"""Controller: inventory history (the last changes to one stock item). Needs the internet."""
from flask import jsonify

from ..database import get_db
from ..models import stock_model
from .auth_controller import device_required


@device_required
def history(item_id):
    return jsonify(moves=stock_model.history(get_db(), item_id))
