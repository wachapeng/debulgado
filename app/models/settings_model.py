"""Model: app_settings table (shop password hash, sync change counter)."""


def get(db, key, default=''):
    row = db.one('SELECT setting_value AS v FROM app_settings WHERE setting_key = ?', key)
    return row['v'] if row else default


def put(db, key, value):
    if db.one('SELECT setting_key FROM app_settings WHERE setting_key = ?', key):
        db.run('UPDATE app_settings SET setting_value = ? WHERE setting_key = ?', str(value), key)
    else:
        db.run('INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)', key, str(value))


def current_seq(db):
    return int(get(db, 'seq', '0') or 0)


class ChangeCounter:
    """Hands out change numbers (seq) during one transaction.

    Every saved row gets the next number. A device that last synced at number N
    downloads only rows with seq > N. The counter row stays locked until the
    transaction ends, so two uploads can never get the same numbers.
    """

    def __init__(self, db):
        self.db = db
        row = db.one("SELECT setting_value AS v FROM app_settings WHERE setting_key = 'seq'" + db.for_update)
        if row is None:
            db.run("INSERT INTO app_settings (setting_key, setting_value) VALUES ('seq', '0')")
            row = {'v': '0'}
        self.value = int(row['v'] or 0)
        self.changed = False

    def next(self):
        self.value += 1
        self.changed = True
        return self.value

    def save(self):
        if self.changed:
            self.db.run("UPDATE app_settings SET setting_value = ? WHERE setting_key = 'seq'", str(self.value))
