"""Builds the service worker (the part that keeps the app working offline).

It lists every file in public/ and gives them a version number based on their
contents, so phones and laptops download a new copy whenever the app changes.
Served at /sw.js by app/controllers/page_controller.py.
"""
import hashlib
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(os.path.dirname(HERE), 'public')
TEMPLATE = os.path.join(HERE, 'sw_template.js')


def app_files():
    files = []
    for folder, _dirs, names in os.walk(PUBLIC):
        for name in names:
            if name == 'sw.js' or name.startswith('.'):
                continue
            files.append(os.path.relpath(os.path.join(folder, name), PUBLIC).replace(os.sep, '/'))
    return sorted(files)


def render():
    files = app_files()
    digest = hashlib.sha1()
    for f in files:
        digest.update(f.encode())
        with open(os.path.join(PUBLIC, f), 'rb') as fh:
            digest.update(fh.read())
    with open(TEMPLATE, encoding='utf-8') as fh:
        code = fh.read()
    code = re.sub(r"const VERSION = .*?; // @version", f"const VERSION = '{digest.hexdigest()[:10]}'; // @version", code)
    code = re.sub(r"const FILES = .*?; // @files", "const FILES = " + json.dumps(['./'] + files) + "; // @files", code)
    return code, len(files)
