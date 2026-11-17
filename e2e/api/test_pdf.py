from common import *  # noqa: F401,F403 — logs in on import
import common
import re
import urllib.request
import zlib

def get_pdf(rid):
    """(status, Content-Type, Content-Disposition, body) of the PDF export."""
    try:
        with common._opener.open(BASE + f'/api/recipes/{rid}/pdf') as resp:
            return resp.status, resp.headers.get_content_type(), resp.headers.get('Content-Disposition', ''), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get_content_type(), '', e.read()

def pages(body): return len(re.findall(rb'/Type\s*/Page(?!s)', body))
def images(body): return len(re.findall(rb'/Subtype\s*/Image', body))

def chars_of(body):
    """The characters the PDF shows. Text is drawn as glyph ids of font subsets, so this reads
    the fonts' ToUnicode maps (lines of <first glyph><last glyph><first character>) instead."""
    chars = set()
    for m in re.finditer(rb'stream\r?\n(.*?)\r?\nendstream', body, re.S):
        try:
            s = zlib.decompress(m.group(1))
        except zlib.error:
            s = m.group(1)  # the CMaps are written uncompressed
        for a, b, u in re.findall(rb'^<([0-9A-F]+)>\s*<([0-9A-F]+)>\s*<([0-9A-F]{4})>', s, re.M | re.I):
            first = int(u, 16)
            chars.update(chr(first + i) for i in range(int(b, 16) - int(a, 16) + 1))
    return chars

st, cover = upload('rot.jpg', 'image/jpeg')
check('upload cover', st == 201, (st, cover))

recipe = dict(
    title='Вареники: з картоплею / грибами', description='Як у бабусі.', timeText='1 год', notes='Ліпити швидко.\n\nМожна заморозити.',
    servings=4, tags=['щука'], photos=[{'id': cover['id']}],
    ingredientGroups=[dict(name='Тісто', ingredients=[dict(name='Борошно', quantity='500 г'), dict(name='Вода', quantity='250 мл')]),
                      dict(name='', ingredients=[dict(name='Картопля', quantity='1 кг')])],
    steps=[dict(text='Замісіть тісто.', timerSeconds=1800, photos=[]), dict(text='Зліпіть вареники.', photos=[])],
)
st, r = req('POST', '/api/recipes', recipe)
check('create', st == 201, (st, r))

st, ctype, disp, body = get_pdf(r['id'])
check('pdf 200', st == 200 and ctype == 'application/pdf' and body.startswith(b'%PDF-'), (st, ctype, body[:20]))
check('pdf is a download named after the title, unsafe characters replaced',
      disp.startswith('attachment') and "filename*=utf-8''" in disp
      and urllib.parse.unquote(disp.split("''", 1)[1]) == 'Вареники з картоплею грибами.pdf', disp)
check('pdf one page with the cover', pages(body) == 1 and images(body) == 1, (pages(body), images(body)))
chars = chars_of(body)
for word in ['Вареники', 'Тісто', 'Інгредієнти №2', 'Приготування', 'Таймер: 30 хв', 'Примітки', 'на 4 порції', '500 г']:
    check(f'pdf shows «{word}»', set(word) <= chars, set(word) - chars)
# «щ» is only in the tag
check('pdf leaves tags out', 'щ' not in chars and 'Щ' not in chars, sorted(chars))

# no photo, many steps: several pages, no image
long = dict(recipe, title='', photos=[], steps=[dict(text='Крок ' + 'дуже довгий опис кроку ' * 30, photos=[]) for _ in range(12)])
st, r2 = req('POST', '/api/recipes', long)
st, ctype, disp, body = get_pdf(r2['id'])
check('long recipe spans pages', st == 200 and pages(body) > 1 and images(body) == 0, (st, pages(body), images(body)))
check('untitled recipe gets a fallback name', urllib.parse.unquote(disp.split("''", 1)[-1]) == f'Без назви {r2["id"]}.pdf', disp)

st, _, _, _ = get_pdf(999999)
check('pdf of a missing recipe 404', st == 404, st)
try:
    urllib.request.urlopen(BASE + f'/api/recipes/{r["id"]}/pdf')
    anon = 200
except urllib.error.HTTPError as e:
    anon = e.code
check('pdf without a session 401', anon == 401, anon)
finish()
