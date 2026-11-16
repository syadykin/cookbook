"""Run against a server started on legacy_db.py's database: ingredients land in one unnamed
group per recipe, with their ids and order."""
from common import *  # noqa: F401,F403 — logs in on import

st, r = req('GET', '/api/recipes/1')
check('legacy recipe 200', st == 200, (st, r))
groups = r.get('ingredientGroups') or []
check('one unnamed group', len(groups) == 1 and groups[0]['name'] == '', groups)
check('ids and order kept', [(i['id'], i['name']) for i in groups[0]['ingredients']] == [(11, 'Борошно'), (10, 'Вода')], groups)
check('recipe without ingredients has no groups', req('GET', '/api/recipes/2')[1]['ingredientGroups'] == [])
check('each recipe its own group', [i['id'] for i in req('GET', '/api/recipes/3')[1]['ingredientGroups'][0]['ingredients']] == [12])

# the migrated data saves like any other
r['ingredientGroups'].append(dict(name='Начинка', ingredients=[dict(name='Вишні', quantity='300 г')]))
st, u = req('PUT', '/api/recipes/1', r, {'If-Match': f'"{r["version"]}"'})
check('save after migration', st == 200 and [g['name'] for g in u['ingredientGroups']] == ['', 'Начинка'], (st, u))
finish()
