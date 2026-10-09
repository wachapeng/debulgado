"""Models: everything that reads or writes the database lives in this folder.

Helpers shared by the models: the app works in centavos (7000 = P70.00),
the database stores pesos with 2 decimals.
"""
import datetime
import re
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

import config

DATETIME_RE = re.compile(r'^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$')


def text(value, max_len, default=None):
    if value is None:
        return default
    value = str(value).strip()[:max_len]
    return value if value else default


def to_pesos(centavos):
    """7050 -> '70.50' (text, so both MySQL and SQLite store it exactly)."""
    try:
        return str((Decimal(int(round(float(centavos or 0)))) / 100).quantize(Decimal('0.01')))
    except (TypeError, ValueError, InvalidOperation):
        return '0.00'


def to_centavos(pesos):
    """Database value (70.5, Decimal('70.50')...) -> 7050."""
    if pesos is None:
        return None
    return int((Decimal(str(pesos)) * 100).to_integral_value())


def maybe_pesos(centavos):
    return None if centavos is None or centavos == '' else to_pesos(centavos)


def flag(value):
    return 0 if value in (0, False, '0', 'false', None) else 1


def valid_datetime(value):
    value = str(value or '')
    if not DATETIME_RE.match(value):
        return None
    try:
        datetime.datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        return value
    except ValueError:
        return None


def valid_iso(value):
    value = str(value or '')
    return value if ISO_RE.match(value) else None


def now_local():
    """Current shop time, e.g. 2026-10-09 08:55:00."""
    try:
        zone = ZoneInfo(config.TIMEZONE)
    except Exception:
        zone = None
    return datetime.datetime.now(zone).strftime('%Y-%m-%d %H:%M:%S')


def now_iso():
    now = datetime.datetime.now(datetime.timezone.utc)
    return now.strftime('%Y-%m-%dT%H:%M:%S.') + f'{now.microsecond // 1000:03d}Z'
