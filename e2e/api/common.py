"""Tiny HTTP client for the API checks: a cookie jar logged in through the local provider."""

import http.cookiejar
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = sys.argv[1]
IMAGES = sys.argv[2] if len(sys.argv) > 2 else ''

_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))


def req(method, path, body=None, headers=None, raw=None, ctype='application/json'):
    """Returns (status, decoded JSON or raw bytes); never raises on HTTP errors."""
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    r = urllib.request.Request(
        BASE + path,
        data=data,
        method=method,
        headers={**({'Content-Type': ctype} if data else {}), **(headers or {})},
    )
    try:
        with _opener.open(r) as resp:
            b = resp.read()
            is_json = resp.headers.get_content_type() == 'application/json'
            return resp.status, (json.loads(b) if b and is_json else b)
    except urllib.error.HTTPError as e:
        b = e.read()
        return e.code, (json.loads(b) if b else None)


def q(path, **params):
    """Path with a properly encoded query string (Cyrillic included)."""
    return path + '?' + urllib.parse.urlencode(params)


def upload(name, ctype='application/octet-stream'):
    bnd = uuid.uuid4().hex
    with open(IMAGES + '/' + name, 'rb') as f:
        content = f.read()
    body = (
        f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
        f'Content-Type: {ctype}\r\n\r\n'
    ).encode() + content + f'\r\n--{bnd}--\r\n'.encode()
    return req('POST', '/api/photos', raw=body, ctype='multipart/form-data; boundary=' + bnd)


def slow_upload(size, chunk=64 * 1024, pause=0.005):
    """Uploads `size` bytes in small timed chunks over a raw socket, like a phone on a slow
    network, and returns the status line the server answered with (or the socket error)."""
    url = urllib.parse.urlsplit(BASE)
    cookie = '; '.join(f'{c.name}={c.value}' for c in _jar)
    bnd = uuid.uuid4().hex
    body = (
        f'--{bnd}\r\nContent-Disposition: form-data; name="file"; filename="big.jpg"\r\n'
        'Content-Type: image/jpeg\r\n\r\n'
    ).encode() + b'\xff' * size + f'\r\n--{bnd}--\r\n'.encode()
    head = (
        f'POST {url.path}/api/photos HTTP/1.1\r\nHost: {url.netloc}\r\nCookie: {cookie}\r\n'
        f'Content-Type: multipart/form-data; boundary={bnd}\r\nContent-Length: {len(body)}\r\n'
        'Connection: close\r\n\r\n'
    ).encode()
    with socket.create_connection((url.hostname, url.port)) as s:
        try:
            s.sendall(head)
            for i in range(0, len(body), chunk):
                s.sendall(body[i : i + chunk])
                time.sleep(pause)
            return s.recv(200).split(b'\r\n')[0].decode()
        except OSError as e:
            return f'socket error: {e}'


_ok = True
_ci = bool(os.environ.get('GITHUB_ACTIONS'))


def check(name, cond, extra=''):
    global _ok
    print(('PASS ' if cond else 'FAIL ') + name, '' if cond else extra)
    if not cond and _ci:
        # shows up on the run page without opening the log
        print(f'::error title=e2e {sys.argv[0].split("/")[-1]}::{name} {extra}'.replace('\n', ' '))
    _ok &= bool(cond)


def finish():
    print('ALL OK' if _ok else 'SOME FAILED')
    sys.exit(0 if _ok else 1)


def login():
    req('GET', '/api/auth/local/login')
    assert any(c.name == 'session' for c in _jar), 'local login gave no session cookie'


login()
