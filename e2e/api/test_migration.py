"""Run against a server started on legacy_db.py's database (its path is the second argument):
ingredients land in one unnamed group per recipe, with their ids and order, and stored times
move to UTC, and
recipes may have 0 servings."""
import sqlite3

from common import *  # noqa: F401,F403 — logs in on import

DB = sys.argv[2]


def local_times():
    """Stored datetime values not in UTC, as (table, column, value)."""
    db = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    try:
        cols = db.execute("""SELECT m.name, c.name FROM sqlite_master m JOIN pragma_table_info(m.name) c
            WHERE m.type = 'table' AND lower(c.type) = 'datetime'""").fetchall()
        return [(t, c, v) for t, c in cols
                for (v,) in db.execute(f'SELECT "{c}" FROM "{t}" WHERE "{c}" IS NOT NULL')
                if not v.endswith('+00:00')]
    finally:
        db.close()


lst = req('GET', '/api/recipes')[1]['items']
check('list sorted by real time across offsets', [r['id'] for r in lst] == [2, 1, 3], lst)
check('times served in UTC, fraction kept', lst[0]['updatedAt'] == '2026-10-25T01:10:00.5Z', lst[0])
check('stored times rewritten in UTC', local_times() == [], local_times())

st, r = req('GET', '/api/recipes/1')
check('legacy recipe 200', st == 200, (st, r))
groups = r.get('ingredientGroups') or []
check('one unnamed group', len(groups) == 1 and groups[0]['name'] == '', groups)
check('ids and order kept', [(i['id'], i['name']) for i in groups[0]['ingredients']] == [(11, 'Борошно'), (10, 'Вода')], groups)
check('recipe without ingredients has no groups', req('GET', '/api/recipes/2')[1]['ingredientGroups'] == [])
check('each recipe its own group', [i['id'] for i in req('GET', '/api/recipes/3')[1]['ingredientGroups'][0]['ingredients']] == [12])

# the migrated data saves like any other
r['servings'] = 0
r['ingredientGroups'].append(dict(name='Начинка', ingredients=[dict(name='Вишні', quantity='300 г')]))
st, u = req('PUT', '/api/recipes/1', r, {'If-Match': f'"{r["version"]}"'})
check('save after migration', st == 200 and [g['name'] for g in u['ingredientGroups']] == ['', 'Начинка'], (st, u))
# the recipes table was rebuilt to allow 0 servings; its children must not have gone with it
check('0 servings after migration', u['servings'] == 0, u)
check('other recipes keep their ingredients', [i['id'] for i in req('GET', '/api/recipes/3')[1]['ingredientGroups'][0]['ingredients']] == [12])
# the server runs in a non-UTC TZ (run.sh), so this also covers fresh writes and the session row
check('new writes stored in UTC', local_times() == [], local_times())
check('saved recipe first', [r['id'] for r in req('GET', '/api/recipes')[1]['items']][0] == 1)
finish()
