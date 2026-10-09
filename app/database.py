"""Database connection.

Online (Vercel) the app uses a MySQL database whose details come from environment
variables (see config.py). On your own PC it can also use local MySQL (XAMPP), or a
SQLite file if no MySQL is set up. Models always write SQL with ? placeholders;
this module adapts them for MySQL.

The tables come from database/debulgado_pos.sql. They are created automatically
the first time the app runs against an empty database.
"""
import datetime
import os
import re
import sqlite3
import ssl
from contextlib import contextmanager
from urllib.parse import unquote, urlsplit

from flask import g

import config

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL_FILE = os.path.join(ROOT, 'database', 'debulgado_pos.sql')
ON_VERCEL = bool(os.environ.get('VERCEL'))
TABLES = ['app_settings', 'devices', 'shop_settings', 'categories', 'products', 'addons',
          'addon_categories', 'orders', 'order_items', 'order_item_addons', 'online_orders']


class DatabaseNotConfigured(Exception):
    """Raised on Vercel when no MySQL details have been added yet."""


# ---------------------------------------------------------------------
#  Where the database is
# ---------------------------------------------------------------------

def _ssl_from_url(query):
    q = query.lower()
    if 'ssl-mode=disabled' in q or 'ssl=false' in q:
        return 'off'
    if 'ssl-mode=required' in q or 'sslmode=require' in q:
        return 'require'
    if 'sslaccept=strict' in q or 'ssl-mode=verify' in q or 'ssl=true' in q:
        return 'verify'
    return 'auto'


def mysql_settings():
    """MySQL details from environment variables (Vercel) or config.py. None means no MySQL."""
    env = os.environ
    url = env.get('DATABASE_URL') or env.get('MYSQL_URL') or ''
    if url.lower().startswith('mysql'):
        u = urlsplit(url)
        return {'host': u.hostname, 'port': u.port or 3306, 'user': unquote(u.username or ''),
                'password': unquote(u.password or ''), 'database': unquote(u.path.lstrip('/')) or 'debulgado',
                'ssl': env.get('MYSQL_SSL') or _ssl_from_url(u.query)}
    for prefix, port in (('MYSQL_', 3306), ('TIDB_', 4000)):  # TiDB Cloud's Vercel integration uses TIDB_*
        if env.get(prefix + 'HOST'):
            return {'host': env[prefix + 'HOST'].strip(), 'port': int(env.get(prefix + 'PORT') or port),
                    'user': env.get(prefix + 'USER', ''), 'password': env.get(prefix + 'PASSWORD', ''),
                    'database': env.get(prefix + 'DATABASE') or 'debulgado', 'ssl': env.get('MYSQL_SSL') or 'auto'}
    if str(config.MYSQL_HOST).strip():
        return {'host': config.MYSQL_HOST.strip(), 'port': int(config.MYSQL_PORT or 3306), 'user': config.MYSQL_USER,
                'password': config.MYSQL_PASSWORD, 'database': config.MYSQL_DATABASE or 'debulgado', 'ssl': config.MYSQL_SSL}
    return None


MYSQL = mysql_settings()
ENGINE = 'mysql' if MYSQL else 'sqlite'


def sqlite_path():
    path = config.SQLITE_FILE
    return path if os.path.isabs(path) else os.path.join(ROOT, path)


def describe():
    """Short text for logs: which database is in use (never the password)."""
    if MYSQL:
        return f"MySQL {MYSQL['user']}@{MYSQL['host']}:{MYSQL['port']}/{MYSQL['database']}"
    return f'SQLite file {sqlite_path()}'


# ---------------------------------------------------------------------
#  Connecting
# ---------------------------------------------------------------------

def _tls_mode(s):
    mode = str(s.get('ssl') or 'auto').strip().lower()
    if mode == 'auto':
        mode = 'off' if s['host'] in ('localhost', '127.0.0.1', '::1') else 'verify'
    return mode


def _ssl_context(mode):
    if mode == 'off':
        return None
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    if mode == 'require':  # encrypted, but the certificate isn't checked (e.g. Aiven's own certificates)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _safe_name(name):
    if not re.fullmatch(r'[A-Za-z0-9_$-]{1,64}', name or ''):
        raise ValueError('The database name may only use letters, numbers, _ $ and -.')
    return name


def _connect_mysql(s):
    try:
        import pymysql
        kwargs = dict(host=s['host'], port=s['port'], user=s['user'], password=s['password'], charset='utf8mb4',
                      autocommit=True, connect_timeout=10, cursorclass=pymysql.cursors.DictCursor)
        ctx = _ssl_context(_tls_mode(s))
        if ctx:
            kwargs['ssl'] = ctx
        try:
            return pymysql.connect(database=s['database'], **kwargs)
        except pymysql.err.OperationalError as e:
            if e.args and e.args[0] == 1049:  # unknown database: create it, then connect again
                conn = pymysql.connect(**kwargs)
                conn.cursor().execute(f"CREATE DATABASE IF NOT EXISTS `{_safe_name(s['database'])}` "
                                      "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                conn.close()
                return pymysql.connect(database=s['database'], **kwargs)
            raise
    except ImportError:
        import MySQLdb
        import MySQLdb.cursors
        mode = _tls_mode(s)
        extra = {}
        if mode == 'verify':
            try:
                import certifi
                extra['ssl'] = {'ca': certifi.where()}
            except ImportError:
                extra['ssl_mode'] = 'VERIFY_IDENTITY'
        elif mode == 'require':
            extra['ssl_mode'] = 'REQUIRED'
        return MySQLdb.connect(host=s['host'], port=s['port'], user=s['user'], passwd=s['password'], db=s['database'],
                               charset='utf8mb4', autocommit=True, connect_timeout=10,
                               cursorclass=MySQLdb.cursors.DictCursor, **extra)


def _connect():
    if MYSQL:
        return _connect_mysql(MYSQL)
    if ON_VERCEL:
        raise DatabaseNotConfigured(
            'This server has no database yet. In Vercel, open the project, go to Settings > Environment Variables, '
            'add the MySQL details (see README.md), then redeploy.')
    os.makedirs(os.path.dirname(sqlite_path()), exist_ok=True)
    conn = sqlite3.connect(sqlite_path(), timeout=20, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def _plain(value):
    """Turn database values into plain Python values (dates as text)."""
    if isinstance(value, datetime.datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, datetime.date):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode('utf-8')
    return value


class Db:
    def __init__(self, conn):
        self.conn = conn
        self.mysql = ENGINE == 'mysql'
        self.for_update = ' FOR UPDATE' if self.mysql else ''
        self._depth = 0
        self._savepoints = 0

    def _sql(self, sql):
        return sql.replace('%', '%%').replace('?', '%s') if self.mysql else sql

    def execute(self, sql, params=()):
        if self.mysql:
            cur = self.conn.cursor()
            if params:
                cur.execute(self._sql(sql), tuple(params))
            else:
                cur.execute(sql)  # no parameters: run exactly as written
            return cur
        return self.conn.execute(sql, tuple(params))

    def one(self, sql, *params):
        row = self.execute(sql, params).fetchone()
        return {k: _plain(v) for k, v in dict(row).items()} if row else None

    def all(self, sql, *params):
        return [{k: _plain(v) for k, v in dict(r).items()} for r in self.execute(sql, params).fetchall()]

    def run(self, sql, *params):
        """Run an INSERT/UPDATE/DELETE. Returns the new row id (for inserts)."""
        return self.execute(sql, params).lastrowid

    def run_many(self, sql, rows):
        """The same INSERT for many rows, sent to the database in one go."""
        rows = [tuple(r) for r in rows]
        if not rows:
            return
        if self.mysql:
            self.conn.cursor().executemany(self._sql(sql), rows)
        else:
            self.conn.executemany(sql, rows)

    @contextmanager
    def transaction(self):
        if self._depth:
            self._depth += 1
            try:
                yield self
            finally:
                self._depth -= 1
            return
        self.execute('START TRANSACTION' if self.mysql else 'BEGIN IMMEDIATE')
        self._depth = 1
        try:
            yield self
            self.execute('COMMIT')
        except BaseException:
            self.execute('ROLLBACK')
            raise
        finally:
            self._depth = 0

    @contextmanager
    def savepoint(self):
        """Undo just one part of a transaction if it fails (so one bad order can't block a whole sync)."""
        self._savepoints += 1
        name = f'sp{self._savepoints}'
        self.execute(f'SAVEPOINT {name}')
        try:
            yield self
            self.execute(f'RELEASE SAVEPOINT {name}')
        except Exception:
            self.execute(f'ROLLBACK TO SAVEPOINT {name}')
            raise

    def table_exists(self, name):
        if self.mysql:
            row = self.one('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', name)
        else:
            row = self.one("SELECT COUNT(*) AS n FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?", name)
        return row['n'] > 0

    def column_exists(self, table, column):
        if self.mysql:
            row = self.one('SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', table, column)
            return row['n'] > 0
        return any(r['name'] == column for r in self.all(f'PRAGMA table_info({table})'))

    def close(self):
        try:
            self.conn.close()
        except Exception:
            pass


def get_db():
    """The database connection for the current web request (opened on first use)."""
    if 'db' not in g:
        g.db = Db(_connect())
    return g.db


def close_db(_error=None):
    db = g.pop('db', None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------
#  Creating the tables from database/debulgado_pos.sql
# ---------------------------------------------------------------------

def sql_statements(text):
    """Split an .sql file into statements (each ends with ; at the end of a line)."""
    statements, buffer = [], []
    for line in text.splitlines():
        buffer.append(line)
        if not line.lstrip().startswith('--') and line.rstrip().endswith(';'):
            statement = '\n'.join(buffer).strip()
            buffer = []
            if any(l.strip() and not l.strip().startswith('--') for l in statement.splitlines()):
                statements.append(statement)
    return statements


def _for_sqlite(statement):
    """Adapt one MySQL statement to SQLite (returns None for MySQL-only lines such as SET NAMES)."""
    code = '\n'.join(l for l in statement.splitlines() if not l.strip().startswith('--')).strip()
    if re.match(r'SET\s', code, re.I):
        return None
    code = code.replace('INT AUTO_INCREMENT PRIMARY KEY', 'INTEGER PRIMARY KEY AUTOINCREMENT')
    code = re.sub(r'\)\s*ENGINE=[^;]*;$', ');', code)
    return code


_schema_ready = False

# Columns added after the first version. A database made by an older version gets them
# automatically on the next start; existing data is kept.
UPGRADES = [
    ('products', 'image', 'MEDIUMTEXT NULL', 'TEXT NULL'),
    ('orders', 'customer_name', 'VARCHAR(60) NULL', 'TEXT NULL'),
    ('orders', 'online_order_id', 'VARCHAR(64) NULL', 'TEXT NULL'),
]
NEW_TABLES = ['online_orders']  # tables added after the first version


def _create_from_sql_file(db, table):
    """Run the CREATE TABLE (and CREATE INDEX) statements for one table from debulgado_pos.sql."""
    with open(SQL_FILE, encoding='utf-8') as f:
        statements = sql_statements(f.read())
    pattern = re.compile(rf'^\s*CREATE\s+(TABLE\s+{table}\s*\(|INDEX\s+\w+\s+ON\s+{table}\s*\()', re.I | re.M)
    for s in statements:
        code = '\n'.join(l for l in s.splitlines() if not l.strip().startswith('--'))
        if pattern.search(code):
            db.execute(code if db.mysql else _for_sqlite(s))
    if not db.mysql:
        db.conn.commit()


def _upgrade(db):
    for table in NEW_TABLES:
        if db.table_exists(table):
            continue
        try:
            _create_from_sql_file(db, table)
        except Exception:
            if not db.table_exists(table):  # another server instance may have just made it
                raise
    for table, column, mysql_type, sqlite_type in UPGRADES:
        if db.column_exists(table, column):
            continue
        try:
            db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {mysql_type if db.mysql else sqlite_type}')
            if not db.mysql:
                db.conn.commit()
        except Exception:
            if not db.column_exists(table, column):  # another server instance may have just added it
                raise


def ensure_schema():
    """Create the tables and starting menu if the database is empty. Never touches existing data.
    Runs once per server start, on the first request."""
    global _schema_ready
    if _schema_ready:
        return
    db = Db(_connect())
    try:
        if not db.table_exists('app_settings'):
            present = [t for t in TABLES if db.table_exists(t)]
            if present:
                raise RuntimeError('The database already has some POS tables (' + ', '.join(present) + ') but not all of them. '
                                   'Import database/debulgado_pos.sql into it, or use an empty database.')
            with open(SQL_FILE, encoding='utf-8') as f:
                statements = sql_statements(f.read())
            if db.mysql:
                for s in statements:
                    db.execute(s)
            else:
                with db.transaction():
                    for s in statements:
                        s = _for_sqlite(s)
                        if s:
                            db.execute(s)
        _upgrade(db)
        _schema_ready = True
    finally:
        db.close()
