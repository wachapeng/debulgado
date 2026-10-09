"""Controller: download the whole database as a MySQL .sql file."""
import datetime

from flask import Response

from ..database import get_db
from ..models import backup_model
from .auth_controller import device_required


@device_required
def download():
    db = get_db()
    shop = db.one('SELECT shop_name FROM shop_settings WHERE id = 1')
    sql = backup_model.dump(db, shop['shop_name'] if shop else 'Coffee shop')
    name = f"debulgado_pos_backup_{datetime.date.today().isoformat()}.sql"
    return Response(sql, mimetype='application/sql',
                    headers={'Content-Disposition': f'attachment; filename="{name}"', 'Cache-Control': 'no-store'})
