"""Model: writes the whole database as a MySQL .sql file (tables + all data).

The result can be imported into phpMyAdmin / XAMPP / any MySQL server, or used to
restore the shop's data on a new server.
"""
import datetime
import decimal

from ..database import SQL_FILE, TABLES, sql_statements

# Order matters: parents before children, so foreign keys line up.
EXPORT_ORDER = TABLES
BATCH = 200


def _literal(value):
    if value is None:
        return 'NULL'
    if isinstance(value, bool):
        return '1' if value else '0'
    if isinstance(value, (int, float, decimal.Decimal)):
        return str(value)
    if isinstance(value, datetime.datetime):
        value = value.strftime('%Y-%m-%d %H:%M:%S')
    elif isinstance(value, datetime.date):
        value = value.isoformat()
    s = str(value)
    s = s.replace('\\', '\\\\').replace("'", "\\'").replace('\x00', '\\0').replace('\r', '\\r').replace('\n', '\\n').replace('\x1a', '\\Z')
    return f"'{s}'"


def _schema_part():
    """The DROP/CREATE part of database/debulgado_pos.sql (everything before the starting data)."""
    with open(SQL_FILE, encoding='utf-8') as f:
        text = f.read()
    schema = text.split('--  STARTING DATA', 1)[0]
    return '\n\n'.join(s for s in sql_statements(schema) if not s.lstrip().upper().startswith('SET '))


def dump(db, shop_name):
    lines = [
        '-- =====================================================================',
        f"--  {shop_name} POS - database backup",
        f"--  Made {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} (server time)",
        '--  Import into phpMyAdmin or: mysql -u USER -p DATABASE_NAME < this_file.sql',
        '--  Importing REPLACES the POS tables in that database with this backup.',
        '-- =====================================================================',
        '',
        'SET NAMES utf8mb4;',
        'SET FOREIGN_KEY_CHECKS = 0;',
        '',
        _schema_part(),
        '',
        '-- =====================================================================',
        '--  DATA',
        '-- =====================================================================',
    ]
    for table in EXPORT_ORDER:
        rows = db.all(f'SELECT * FROM {table}')
        lines.append(f'\n-- {table}: {len(rows)} rows')
        if not rows:
            continue
        cols = list(rows[0].keys())
        step = 10 if table == 'products' else BATCH  # product photos make rows large
        for start in range(0, len(rows), step):
            chunk = rows[start:start + step]
            values = ',\n'.join('  (' + ', '.join(_literal(r[c]) for c in cols) + ')' for r in chunk)
            lines.append(f"INSERT INTO {table} ({', '.join(cols)}) VALUES\n{values};")
    lines += ['', 'SET FOREIGN_KEY_CHECKS = 1;', '']
    return '\n'.join(lines)
