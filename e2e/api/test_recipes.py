from common import *  # noqa: F401,F403 — logs in on import
base = dict(title='Сирники', description='Ніжні', timeText='30 хв', servings=4,
            tags=['Сніданок', 'вегетаріанське', 'сніданок ', ' На   сковороді'], photos=[],
            ingredients=[dict(name='Сир', quantity='500 г'), dict(name='Яйця', quantity='2 шт')],
            steps=[dict(text='Протріть сир', photos=[]), dict(text='Смажте', timerSeconds=240, photos=[])])
st, r = req('POST', '/api/recipes', base)
check('create 201', st == 201, (st, r))
check('tags normalized', r['tags'] == ['сніданок', 'вегетаріанське', 'на сковороді'], r['tags'])
check('version 1', r['version'] == 1)
rid = r['id']; step_ids = [s['id'] for s in r['steps']]; ing_ids = [i['id'] for i in r['ingredients']]
check('timer kept', r['steps'][1]['timerSeconds'] == 240)

st, g = req('GET', f'/api/recipes/{rid}')
check('get 200', st == 200 and g['title'] == 'Сирники')

# update: reorder steps, drop timer, edit ingredient, add one, remove one; send back readOnly fields
upd = dict(g)
upd['steps'] = [dict(g['steps'][1], timerSeconds=None, text='Смажте 4 хв'), g['steps'][0], dict(text='Подавайте', photos=[])]
upd['ingredients'] = [dict(g['ingredients'][1], quantity='3 шт'), dict(name='Борошно', quantity='4 ст. л.')]
upd['title'] = 'Сирники бабусині'
st, u = req('PUT', f'/api/recipes/{rid}', upd, {'If-Match': f'"{g["version"]}"'})
check('update 200', st == 200, (st, u))
check('version bumped', u['version'] == 2)
check('step ids stable', [s['id'] for s in u['steps']][:2] == [step_ids[1], step_ids[0]], [s['id'] for s in u['steps']])
check('timer cleared', u['steps'][0].get('timerSeconds') is None, u['steps'][0])
check('ingredient kept id', u['ingredients'][0]['id'] == ing_ids[1] and u['ingredients'][0]['quantity'] == '3 шт')
check('ingredient removed', ing_ids[0] not in [i['id'] for i in u['ingredients']] and len(u['ingredients']) == 2)

st, c = req('PUT', f'/api/recipes/{rid}', upd, {'If-Match': '"1"'})
check('stale version 412', st == 412 and c['code'] == 'version_conflict', (st, c))
st, c = req('PUT', f'/api/recipes/{rid}', upd)
check('missing If-Match 400', st == 400, (st, c))

# foreign ingredient id is not taken over
st, r2 = req('POST', '/api/recipes', dict(base, title='Борщ', tags=['суп', 'на свято'], ingredients=[dict(id=u['ingredients'][0]['id'], name='Буряк', quantity='2 шт')]))
check('foreign child id -> new row', st == 201 and r2['ingredients'][0]['id'] != u['ingredients'][0]['id'], r2['ingredients'] if st==201 else r2)
st, again = req('GET', f'/api/recipes/{rid}')
check('other recipe untouched', again['ingredients'][0]['name'] == 'Яйця')

def titles(qs): return [x['title'] for x in req('GET', q('/api/recipes', **qs))[1]]
check('summary has description', [x['description'] for x in req('GET', '/api/recipes')[1]] == ['Ніжні', 'Ніжні'])
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

st, bad = req('PUT', f'/api/recipes/{rid}', dict(upd, photos=[{'id': 'nope'}]), {'If-Match': '"2"'})
check('unknown photo 422', st == 422 and 'photos.0' in bad.get('fields', {}), (st, bad))
st, _ = req('GET', f'/api/recipes/{rid}')
check('failed save rolled back', _['version'] == 2 and _['title'] == 'Сирники бабусині')

st, _ = req('DELETE', f'/api/recipes/{rid}')
check('delete 204', st == 204)
st, _ = req('GET', f'/api/recipes/{rid}')
check('gone 404', st == 404)
st, _ = req('DELETE', f'/api/recipes/{rid}')
check('delete again 404', st == 404)
finish()
