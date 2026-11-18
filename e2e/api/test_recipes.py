from common import *  # noqa: F401,F403 — logs in on import
base = dict(title='Сирники', description='Ніжні', timeText='30 хв', notes='  Подавати зі сметаною.\n<b>не</b> HTML  ', servings=4,
            tags=['Сніданок', 'вегетаріанське', 'сніданок ', ' На   сковороді'], photos=[],
            ingredientGroups=[dict(name='', ingredients=[dict(name='Сир', quantity='500 г'), dict(name='Яйця', quantity='2 шт')])],
            steps=[dict(text='Протріть сир', photos=[]), dict(text='Смажте', timerSeconds=240, photos=[])])
st, r = req('POST', '/api/recipes', base)
check('create 201', st == 201, (st, r))
check('tags normalized', r['tags'] == ['сніданок', 'вегетаріанське', 'на сковороді'], r['tags'])
check('version 1', r['version'] == 1)
check('notes trimmed, kept as plain text', r['notes'] == 'Подавати зі сметаною.\n<b>не</b> HTML', r['notes'])
st, sauce = req('POST', '/api/recipes', dict(base, title='Соус', servings=0))
check('0 servings kept (a sauce)', st == 201 and sauce['servings'] == 0, (st, sauce))
req('DELETE', f"/api/recipes/{sauce['id']}")
check('negative servings 422', req('POST', '/api/recipes', dict(base, servings=-1))[0] == 422)
check('notes required', req('POST', '/api/recipes', {k: v for k, v in base.items() if k != 'notes'})[0] == 422)
rid = r['id']; step_ids = [s['id'] for s in r['steps']]; ing_ids = [i['id'] for i in r['ingredientGroups'][0]['ingredients']]
check('timer kept', r['steps'][1]['timerSeconds'] == 240)

st, g = req('GET', f'/api/recipes/{rid}')
check('get 200', st == 200 and g['title'] == 'Сирники')

# update: reorder steps, drop timer, edit ingredient, add one, remove one; send back readOnly fields
upd = dict(g)
upd['steps'] = [dict(g['steps'][1], timerSeconds=None, text='Смажте 4 хв'), g['steps'][0], dict(text='Подавайте', photos=[])]
g0 = g['ingredientGroups'][0]
upd['ingredientGroups'] = [dict(g0, name='  Тісто ', ingredients=[dict(g0['ingredients'][1], quantity='3 шт'), dict(name='Борошно', quantity='4 ст. л.')]),
                           dict(name='Порожня', ingredients=[])]
upd['title'] = 'Сирники бабусині'
st, u = req('PUT', f'/api/recipes/{rid}', upd, {'If-Match': f'"{g["version"]}"'})
check('update 200', st == 200, (st, u))
check('version bumped', u['version'] == 2)
check('step ids stable', [s['id'] for s in u['steps']][:2] == [step_ids[1], step_ids[0]], [s['id'] for s in u['steps']])
check('timer cleared', u['steps'][0].get('timerSeconds') is None, u['steps'][0])
ui = u['ingredientGroups'][0]['ingredients']
check('ingredient kept id', ui[0]['id'] == ing_ids[1] and ui[0]['quantity'] == '3 шт')
check('ingredient removed', ing_ids[0] not in [i['id'] for i in ui] and len(ui) == 2)
check('group kept id, name trimmed', u['ingredientGroups'][0]['id'] == g0['id'] and u['ingredientGroups'][0]['name'] == 'Тісто', u['ingredientGroups'])
check('empty group dropped', len(u['ingredientGroups']) == 1, u['ingredientGroups'])

# a second group in front; one ingredient moves into it, keeping its id
u0 = u['ingredientGroups'][0]
mv = dict(u, ingredientGroups=[dict(name='Начинка', ingredients=[ui[1]]), dict(u0, ingredients=[ui[0]])])
st, m = req('PUT', f'/api/recipes/{rid}', mv, {'If-Match': f'"{u["version"]}"'})
check('groups reordered', st == 200 and [x['name'] for x in m['ingredientGroups']] == ['Начинка', 'Тісто'], (st, m))
check('moved ingredient kept id', [[i['id'] for i in x['ingredients']] for x in m['ingredientGroups']] == [[ui[1]['id']], [ui[0]['id']]], m['ingredientGroups'])
check('existing group kept id', m['ingredientGroups'][1]['id'] == u0['id'])
# dropping a group whose ingredient moves out keeps the ingredient
st, m2 = req('PUT', f'/api/recipes/{rid}', dict(m, ingredientGroups=[dict(m['ingredientGroups'][0], ingredients=m['ingredientGroups'][0]['ingredients'] + m['ingredientGroups'][1]['ingredients'])]), {'If-Match': f'"{m["version"]}"'})
check('group dropped, its ingredient moved', st == 200 and len(m2['ingredientGroups']) == 1 and [i['id'] for i in m2['ingredientGroups'][0]['ingredients']] == [ui[1]['id'], ui[0]['id']], (st, m2))
many = [dict(name=f'x{i}', quantity='') for i in range(101)]
st, bad = req('PUT', f'/api/recipes/{rid}', dict(m2, ingredientGroups=[dict(name='', ingredients=many), dict(name='', ingredients=many)]), {'If-Match': f'"{m2["version"]}"'})
check('over 200 ingredients 422', st == 422 and 'ingredientGroups' in bad.get('fields', {}), (st, bad))
# back to the state the checks below expect
st, u = req('PUT', f'/api/recipes/{rid}', upd, {'If-Match': f'"{m2["version"]}"'})
check('restore 200', st == 200, (st, u))
upd = dict(u)

st, c = req('PUT', f'/api/recipes/{rid}', upd, {'If-Match': '"1"'})
check('stale version 412', st == 412 and c['code'] == 'version_conflict', (st, c))
st, c = req('PUT', f'/api/recipes/{rid}', upd)
check('missing If-Match 400', st == 400, (st, c))

# foreign ingredient id is not taken over
st, r2 = req('POST', '/api/recipes', dict(base, title='Борщ', tags=['суп', 'на свято'], ingredientGroups=[dict(id=u['ingredientGroups'][0]['id'], name='', ingredients=[dict(id=ui[0]['id'], name='Буряк', quantity='2 шт')])]))
check('foreign child id -> new row', st == 201 and r2['ingredientGroups'][0]['ingredients'][0]['id'] != ui[0]['id'] and r2['ingredientGroups'][0]['id'] != u['ingredientGroups'][0]['id'], r2['ingredientGroups'] if st==201 else r2)
st, again = req('GET', f'/api/recipes/{rid}')
check('other recipe untouched', again['ingredientGroups'][0]['ingredients'][0]['name'] == 'Яйця')

def titles(qs): return [x['title'] for x in req('GET', q('/api/recipes', **qs))[1]['items']]
check('summary has description', [x['description'] for x in req('GET', '/api/recipes')[1]['items']] == ['Ніжні', 'Ніжні'])
check('list order', titles({}) == ['Борщ', 'Сирники бабусині'], titles({}))
check('search cyrillic prefix', titles({'q': 'сир'}) == ['Сирники бабусині'], titles({'q': 'сир'}))
check('search case', titles({'q': 'СИРНИКИ'}) == ['Сирники бабусині'])
check('search tag', titles({'q': 'свято'}) == ['Борщ'], titles({'q': 'свято'}))
check('search two words', titles({'q': 'сирн бабус'}) == ['Сирники бабусині'])
check('search nothing', titles({'q': 'піца'}) == [])
check('search syntax-safe', req('GET', q('/api/recipes', q='"OR* (NEAR'))[0] == 200)
check('filter tag', titles({'tag': 'суп'}) == ['Борщ'])
st, tags = req('GET', '/api/tags')
check('tags counts', len(tags) == 5 and all(t['count'] == 1 for t in tags) and [t['name'] for t in tags] == sorted(t['name'] for t in tags), tags)

st, bad = req('PUT', f'/api/recipes/{rid}', dict(upd, photos=[{'id': 'nope'}]), {'If-Match': f'"{u["version"]}"'})
check('unknown photo 422', st == 422 and 'photos.0' in bad.get('fields', {}), (st, bad))
st, _ = req('GET', f'/api/recipes/{rid}')
check('failed save rolled back', _['version'] == u['version'] and _['title'] == 'Сирники бабусині')

st, _ = req('DELETE', f'/api/recipes/{rid}')
check('delete 204', st == 204)
st, _ = req('GET', f'/api/recipes/{rid}')
check('gone 404', st == 404)
st, _ = req('DELETE', f'/api/recipes/{rid}')
check('delete again 404', st == 404)

# pagination: pages keyed by the last row, so edits between pages neither repeat nor skip rows
pages = [req('POST', '/api/recipes', dict(base, title=f'Сторінка {i}', tags=['сторінки'], ingredientGroups=[], steps=[]))[1] for i in range(7)]
newest_first = [p['id'] for p in reversed(pages)]


def walk(between=None, **params):
    """All ids of a list, page by page; `between` runs after the first page. Returns (ids, page sizes)."""
    ids, sizes, cursor = [], [], None
    while True:
        st, page = req('GET', q('/api/recipes', **params, **({'cursor': cursor} if cursor else {})))
        if st != 200:
            return st, page
        ids += [r['id'] for r in page['items']]
        sizes.append(len(page['items']))
        cursor = page.get('nextCursor')
        if not cursor:
            return ids, sizes
        if between and len(sizes) == 1:
            between()


everything = [r['id'] for r in req('GET', q('/api/recipes', limit=100))[1]['items']]
check('default page holds a small list', req('GET', '/api/recipes')[1].get('nextCursor') is None)
check('pages add up to the whole list', walk(limit=2)[0] == everything, (walk(limit=2), everything))
check('filtered pages', walk(tag='сторінки', limit=3) == (newest_first, [3, 3, 1]), walk(tag='сторінки', limit=3))
check('no next page when the last one is full', walk(tag='сторінки', limit=7) == (newest_first, [7]))


def touch_unseen():
    # the oldest of the tag, still on a later page, moves to the top
    p = pages[0]
    check('edit between pages', req('PUT', f'/api/recipes/{p["id"]}', dict(p, title='Сторінка 0 змінена'), {'If-Match': f'"{p["version"]}"'})[0] == 200)


ids, _ = walk(touch_unseen, tag='сторінки', limit=3)
# with offsets the second page would start one row early and repeat one
check('edit between pages: no repeats, others all there', ids == newest_first[:-1], ids)
check('edited recipe first on a fresh list', walk(tag='сторінки', limit=3)[0][0] == pages[0]['id'])

check('bad cursor 400', req('GET', q('/api/recipes', cursor='nonsense'))[0] == 400)
check('limit 0 → 400', req('GET', q('/api/recipes', limit=0))[0] == 400)
check('limit over 100 → 400', req('GET', q('/api/recipes', limit=101))[0] == 400)
finish()
