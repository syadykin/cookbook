from common import *  # noqa: F401,F403 — logs in on import
def up(name):
    st, p = upload(name, 'image/jpeg')
    assert st == 201, (st, p)
    return {'id': p['id']}
c, s1, s2 = up('syrnyky.jpg'), up('step1.jpg'), up('step2.jpg')
st, r = req('POST', '/api/recipes', dict(title='Сирники', description='Ніжні, з хрусткою скоринкою. Найкращі виходять із сухого домашнього сиру.', timeText='30 хв', servings=4,
  tags=['сніданок', 'вегетаріанське', 'на сковороді'], photos=[c, up('step2.jpg')],
  ingredients=[dict(name='Кисломолочний сир, 9%', quantity='500 г'), dict(name='Яйця', quantity='2 шт'), dict(name='Борошно', quantity='4 ст. л.'), dict(name='Цукор', quantity='2 ст. л.'), dict(name='Сіль', quantity='дрібка'), dict(name='Сметана до подачі', quantity='за смаком')],
  steps=[dict(text='Протріть сир через сито або ретельно розімніть виделкою — так сирники будуть ніжнішими.', photos=[s1]),
         dict(text='Додайте яйця, цукор і дрібку солі. Добре перемішайте.', photos=[]),
         dict(text='Всипте борошно й замісіть м’яке тісто. Залиште на 10 хвилин.', timerSeconds=600, photos=[s2]),
         dict(text='Смажте на середньому вогні по 3–4 хвилини з кожного боку.', timerSeconds=5, photos=[])]))
assert st == 201, r
st, b = req('POST', '/api/recipes', dict(title='Борщ', description='', timeText='2 год', servings=6, tags=['суп', 'на свято'], photos=[up('borshch.jpg')], ingredients=[dict(name='Буряк', quantity='2 шт')], steps=[dict(text='Зваріть бульйон.', photos=[])]))
st, u = req('POST', '/api/recipes', dict(title='Узвар', description='', timeText='30 хв', servings=4, tags=['напої', 'на свято'], photos=[], ingredients=[], steps=[]))
print('SEEDED', r['id'], b['id'], u['id'])
