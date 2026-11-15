"""Tiny HTTP client for the API checks: a cookie jar logged in through the local provider."""

import http.cookiejar
import json
import sys
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


_ok = True


def check(name, cond, extra=''):
    global _ok
    print(('PASS ' if cond else 'FAIL ') + name, '' if cond else extra)
    _ok &= bool(cond)


def finish():
    print('ALL OK' if _ok else 'SOME FAILED')
    sys.exit(0 if _ok else 1)


def login():
    req('GET', '/api/auth/local/login')
    assert any(c.name == 'session' for c in _jar), 'local login gave no session cookie'


login()
