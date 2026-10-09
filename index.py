"""Starts the POS web app.

Vercel finds the `app` below automatically and runs it as the server.
To try it on your own PC:  pip install -r requirements.txt  then  python index.py
and open http://localhost:5000
"""
from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
