# =====================================================================
#  Debulgado's Coffee Shop POS - settings
# =====================================================================
#
#  ONLINE (Vercel): don't type passwords here. This file is in your GitHub
#  repository where others could read it. Put the database details in
#  Vercel -> your project -> Settings -> Environment Variables instead:
#
#     MYSQL_HOST      e.g. gateway01.ap-southeast-1.prod.aws.tidbcloud.com
#     MYSQL_PORT      e.g. 4000 (TiDB Cloud) or 3306 (most MySQL servers)
#     MYSQL_USER
#     MYSQL_PASSWORD
#     MYSQL_DATABASE  e.g. debulgado (created automatically if it doesn't exist)
#
#  or a single DATABASE_URL = mysql://USER:PASSWORD@HOST:PORT/DATABASE
#
#  Environment variables always win over the values below.
# =====================================================================

# ---- On your own PC (XAMPP) -----------------------------------------
# Fill these in to use your local MySQL, e.g. host 'localhost', user 'root'.
MYSQL_HOST = ''
MYSQL_PORT = 3306
MYSQL_USER = ''
MYSQL_PASSWORD = ''
MYSQL_DATABASE = 'debulgado'

# Secure connection (TLS) to the database:
#   'auto'    = on for online databases, off for localhost (recommended)
#   'verify'  = always on, and check the server's certificate (TiDB Cloud)
#   'require' = always on, without checking the certificate (Aiven)
#   'off'     = never
MYSQL_SSL = 'auto'

# With no MySQL set up at all, the app runs on your own PC with this SQLite
# file instead (same tables). This is NOT used on Vercel, which can't keep files.
SQLITE_FILE = 'database/debulgado_pos.db'

# Time zone for times the server records (device sign-ins, uploads).
TIMEZONE = 'Asia/Manila'
