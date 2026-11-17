// End-to-end walk through the app in real Chrome. Usage: node browser/run.mjs <base> <shotsdir> <imgdir>
// Expects a fresh database seeded by api/seed.py (recipe ids 1–3).
import { readFileSync } from 'node:fs';

import puppeteer from 'puppeteer-core';

const [base, out, img] = process.argv.slice(2);
let ok = true;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`);
  if (!cond && process.env.GITHUB_ACTIONS) {
    // shows up on the run page without opening the log
    console.log(`::error title=e2e browser::${name} ${extra}`.replace(/\n/g, ' '));
  }
  ok &&= !!cond;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Blink's pointer/hover types are fixed at launch (CDP media emulation ignores them), so the mouse
// and the phone each get their own browser. Types: hover none=1 hover=2; pointer coarse=2 fine=4.
const launch = (hover, pointer) =>
  puppeteer.launch({
    executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
    headless: true,
    args: [
      '--no-sandbox',
      '--hide-scrollbars',
      `--blink-settings=primaryHoverType=${hover},availableHoverTypes=${hover},primaryPointerType=${pointer},availablePointerTypes=${pointer}`,
    ],
  });
const browser = await launch(2, 4);
const phoneBrowser = await launch(1, 2);

// ---------- desktop (mouse): library, view, timers, cook mode, editing --------------------------
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// failed requests (401 before login, the provoked 412, 404 after delete) are expected here
page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));

await page.goto(base + '/', { waitUntil: 'networkidle0' });
check('auto login lands on library', page.url() === base + '/', page.url());
const rows = await page.$$eval('main ul li a', (as) => as.map((a) => a.textContent));
check('three recipes listed', rows.length === 3, rows.join('|'));
const desc = await page.evaluate(() => {
  const row = [...document.querySelectorAll('main ul li a')].find((a) => a.textContent.includes('Сирники'));
  // title, description, meta inside the row's text column
  const d = row.querySelector('div:not([class*="thumb"]) > div:nth-child(2)');
  return {
    text: d?.textContent ?? '',
    oneLine: d ? d.getBoundingClientRect().height < 24 : false,
    cut: d ? d.scrollWidth > d.clientWidth : false,
    ellipsis: d ? getComputedStyle(d).textOverflow : '',
  };
});
check('description under the title', desc.text.startsWith('Ніжні, з хрусткою скоринкою'), desc.text);
check('long description is one line, cut with an ellipsis', desc.oneLine && desc.cut && desc.ellipsis === 'ellipsis', JSON.stringify(desc));
await page.screenshot({ path: `${out}/1-library.png` });

await page.type('#q', 'СИР');
await sleep(400);
const found = await page.$$eval('main ul li a', (as) => as.map((a) => a.textContent));
check('search finds Сирники only', found.length === 1 && found[0].includes('Сирники'), found.join('|'));
await page.$eval('#q', (el) => (el.value = ''));
await page.type('#q', ' ');
await page.keyboard.press('Backspace');

await page.click('button[aria-pressed="false"]::-p-text(на свято)');
await sleep(400);
const byTag = await page.$$eval('main ul li a', (as) => as.map((a) => a.textContent));
check('tag chip filters', byTag.length === 2 && page.url().includes('tag='), byTag.join('|'));
await page.screenshot({ path: `${out}/2-library-filter.png` });
await page.click('button[aria-pressed="true"]');
await sleep(300);

await page.click('a::-p-text(Сирники)');
await page.waitForSelector('h1');
await sleep(500);
check('recipe title', (await page.$eval('h1', (h) => h.textContent)) === 'Сирники');
check('tab title names the recipe', (await page.title()) === 'Сирники — Їжак з макітрою', await page.title());
await page.screenshot({ path: `${out}/3-recipe-top.png` });
// the link is fetched rather than clicked: a headless download goes nowhere to look at
const pdfLink = await page.$eval('a[aria-label="Завантажити PDF"]', async (a) => {
  const res = await fetch(a.href);
  const head = new Uint8Array(await res.arrayBuffer()).slice(0, 5);
  return {
    download: a.hasAttribute('download'),
    status: res.status,
    type: res.headers.get('Content-Type'),
    disposition: res.headers.get('Content-Disposition'),
    magic: String.fromCharCode(...head),
  };
}).catch((e) => ({ error: String(e) }));
check(
  'PDF download link',
  pdfLink.download && pdfLink.status === 200 && pdfLink.type === 'application/pdf' && pdfLink.magic === '%PDF-' &&
    decodeURIComponent(pdfLink.disposition?.split("''")[1] ?? '') === 'Сирники.pdf',
  JSON.stringify(pdfLink),
);
const notes =await page.$eval('#notes-h', (h) => {
  const p = h.closest('section').querySelector('p');
  return { text: p.innerText, breaks: getComputedStyle(p).whiteSpace };
}).catch(() => null);
check('notes shown with line breaks', notes?.text === 'Сир має бути сухим.\nЗамість борошна можна манку.' && notes.breaks === 'pre-line', JSON.stringify(notes));

const qty = () => page.$eval('#ing-h ~ ul li:first-child button span:last-child', (s) => s.textContent).catch(() => null);
const firstQty = async () =>
  page.evaluate(() => document.querySelector('section[aria-labelledby="ing-h"] ul li button span:last-child')?.textContent);
check('base quantity', (await firstQty()) === '500 г', await firstQty());
await page.click('button[aria-label="Більше порцій"]');
check('scaled 500 г → 625 г', (await firstQty()) === '625 г', await firstQty());
const servingsText = await page.$eval('section[aria-labelledby="ing-h"] [aria-live]', (s) => s.textContent);
check('servings label', servingsText === 'на 5 порцій', servingsText);
const pinchQty = await page.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="ing-h"] ul li button')].find((b) => b.textContent.includes('Сіль'))?.textContent);
check('«дрібка» not scaled', pinchQty?.endsWith('дрібка'), pinchQty);
await page.click('section[aria-labelledby="ing-h"] ul li:nth-child(2) button');
check('ingredient crossed', await page.$eval('section[aria-labelledby="ing-h"] ul li:nth-child(2) button', (b) => b.getAttribute('aria-pressed')) === 'true');

// 5-second timer on step 4
const timerBtn = 'button[aria-label^="Запустити таймер на 0:05"]';
await page.click(timerBtn);
await sleep(1300);
const running = await page.$eval('button[aria-label^="Пауза"]', (b) => b.textContent).catch(() => null);
check('timer running and counting', running && /0:0[34]/.test(running), running);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await sleep(300);
await page.screenshot({ path: `${out}/4-recipe-steps.png` });

// cook mode keeps servings, crossed rows and the running timer
await page.click('a::-p-text(Готувати)');
await page.waitForSelector('[aria-label="Слайди"]');
await sleep(400);
const cookServ = await page.$eval('section[aria-label="Інгредієнти"] [aria-live]', (s) => s.textContent);
check('cook mode shares servings', cookServ === 'на 5 порцій', cookServ);
check('tab title in cook mode', (await page.title()) === 'Сирники — Їжак з макітрою', await page.title());
await page.screenshot({ path: `${out}/5-cook-ingredients.png` });

const swipe = async (dx) => {
  const box = await (await page.$('section[aria-hidden="false"]')).boundingBox();
  const y = box.y + 200;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(x + (dx * i) / 8, y);
    await sleep(15);
  }
  await page.mouse.up();
  await sleep(450);
};
const current = () => page.$eval('section[aria-hidden="false"]', (s) => s.getAttribute('aria-label'));
await swipe(-160);
check('swipe left → step 1', (await current()) === 'Крок 1', await current());
await swipe(120);
check('swipe right → ingredients', (await current()) === 'Інгредієнти', await current());
await swipe(30);
check('short drag does not change slide', (await current()) === 'Інгредієнти', await current());
await page.click('button[aria-label="Крок 4"]');
await sleep(450);
check('segment jumps to step 4', (await current()) === 'Крок 4');
// by now the 5 s timer has run out: it must show «Час вийшов» here too
await sleep(2500);
const doneText = await page.$eval('section[aria-hidden="false"] button[aria-label^="Час вийшов"]', (b) => b.textContent).catch(() => null);
check('timer finished in cook mode', doneText === 'Час вийшов', doneText);
await page.screenshot({ path: `${out}/6-cook-step-done.png` });
await page.click('section[aria-hidden="false"] button[aria-label^="Час вийшов"]');
check('ack resets timer', !!(await page.$('section[aria-hidden="false"] button[aria-label^="Запустити таймер на 0:05"]')));
check('last slide shows Готово', !!(await page.$('nav a::-p-text(Готово)')));
await page.keyboard.press('ArrowLeft');
await sleep(400);
check('arrow key → step 3', (await current()) === 'Крок 3');
await page.screenshot({ path: `${out}/7-cook-step3.png` });

// edit in place
await page.click('a[aria-label="Закрити режим готування"]');
await page.waitForSelector('button[aria-label="Редагувати рецепт"]');
await page.click('button[aria-label="Редагувати рецепт"]');
await page.waitForSelector('input[placeholder="Назва рецепта"]');
check('edit flag in URL', page.url().includes('edit'));
await page.screenshot({ path: `${out}/8-edit-top.png` });
await page.click('input[placeholder="Назва рецепта"]', { clickCount: 3 });
await page.type('input[placeholder="Назва рецепта"]', 'Сирники бабусині');
await page.type('input[placeholder="+ тег"]', 'Улюблене');
await page.keyboard.press('Enter');
check('tag added lowercased', !!(await page.$('span::-p-text(улюблене)')));
check('tab title follows the title being typed', (await page.title()) === 'Сирники бабусині — Їжак з макітрою', await page.title());
await page.click('button::-p-text(Додати інгредієнт)');
await sleep(100);
const focusedIsNew = await page.evaluate(() => document.activeElement?.placeholder);
check('new ingredient focused', focusedIsNew === 'Інгредієнт', focusedIsNew);
await page.keyboard.type('Ванільний цукор');
await page.keyboard.press('Tab');
await page.keyboard.type('1 ч. л.');
// select() rather than a triple click, which takes only one line of a textarea
await page.$eval('textarea[placeholder="Заміни, поради, звідки рецепт"]', (t) => (t.focus(), t.select()));
await page.keyboard.type('Подавати теплими.');

// upload a photo through the desktop file dialog
// centred, so the sticky header is not what receives the click
await page.$eval('button[aria-label="Додати фото рецепта"]', (b) => b.scrollIntoView({ block: 'center' }));
const [chooser] = await Promise.all([page.waitForFileChooser({ timeout: 5000 }), page.click('button[aria-label="Додати фото рецепта"]')]);
await chooser.accept([`${img}/step1.jpg`]);
await page.waitForFunction(() => !document.querySelector('[aria-label*="завантажується"]'), { timeout: 15000 });
const thumbs = await page.$$('section[aria-label="Фото страви"] button[aria-label^="Фото"]');
check('photo uploaded in editor', thumbs.length === 3, thumbs.length);

// draft survives a reload
await sleep(200);
await page.reload({ waitUntil: 'networkidle0' });
const restoredTitle = await page.$eval('input[placeholder="Назва рецепта"]', (i) => i.value);
check('draft restored after reload', restoredTitle === 'Сирники бабусині', restoredTitle);
check('restore notice shown', !!(await page.$('p::-p-text(Відновлено незбережені зміни)')));

// a change made elsewhere meanwhile → 412 → conflict dialog
await page.evaluate(async () => {
  const r = await (await fetch('/api/recipes/1')).json();
  await fetch('/api/recipes/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'If-Match': String(r.version) },
    body: JSON.stringify({ ...r, createdAt: undefined, updatedAt: undefined, description: 'Змінено деінде' }),
  });
});
await page.click('button::-p-text(Готово)');
await page.waitForSelector('::-p-text(Рецепт змінився)', { timeout: 5000 }).catch(() => null);
check('conflict dialog on 412', !!(await page.$('::-p-text(Рецепт змінився)')));
await sleep(300);
await page.screenshot({ path: `${out}/9-conflict.png` });
await page.click('button::-p-text(Залишити мої)');
await sleep(500);
await page.click('button::-p-text(Готово)');
await page.waitForFunction(() => !location.search.includes('edit'), { timeout: 5000 }).catch(() => null);
await sleep(500);
const savedTitle = await page.$eval('h1', (h) => h.textContent);
check('saved over newer version', savedTitle === 'Сирники бабусині' && !page.url().includes('edit'), savedTitle);
const api = await page.evaluate(async () => (await fetch('/api/recipes/1')).json());
check('server has new tag, ingredient, photo, notes', api.tags.includes('улюблене') && api.ingredientGroups[0].ingredients.some((i) => i.name === 'Ванільний цукор') && api.photos.length === 3 && api.notes === 'Подавати теплими.', JSON.stringify({ t: api.tags, p: api.photos.length, n: api.notes }));
check('draft cleared after save', (await page.evaluate(() => localStorage.getItem('draft:recipe:1'))) === null);
check('lone unnamed group has no heading', (await page.$$('section[aria-labelledby="ing-h"] h3')).length === 0);

// ingredient groups (Борщ is seeded with an unnamed group and «Зажарка»)
await page.goto(base + '/r/2', { waitUntil: 'networkidle0' });
const groupHeadings = () => page.$$eval('section[aria-labelledby="ing-h"] h3', (hs) => hs.map((h) => h.textContent));
check('group headings, the unnamed one numbered', JSON.stringify(await groupHeadings()) === '["Інгредієнти №1","Зажарка"]', JSON.stringify(await groupHeadings()));
await page.screenshot({ path: `${out}/9a-groups.png` });
const borshch = await page.evaluate(async () => (await fetch('/api/recipes/2')).json());
await page.click('button[aria-label="Редагувати рецепт"]');
await page.waitForSelector('input[placeholder="Назва рецепта"]');
const editorGroups = () =>
  page.$$eval('[data-group]', (gs) =>
    gs.map((g) => ({
      name: g.querySelector('input[id^="grp-"]').value,
      placeholder: g.querySelector('input[id^="grp-"]').placeholder,
      rows: [...g.querySelectorAll('input[placeholder="Інгредієнт"]')].map((i) => i.value),
    })),
  );
let eg = await editorGroups();
check('editor numbers the unnamed group', eg[0].placeholder === 'Інгредієнти №1' && eg[1].name === 'Зажарка', JSON.stringify(eg));
await page.click('button::-p-text(Додати групу)');
await sleep(100);
check('new group name focused', await page.evaluate(() => document.activeElement?.id.startsWith('grp-')));
await page.keyboard.type('Подача');
await page.type('[data-group="2"] input[placeholder="Інгредієнт"]', 'Сметана');
// drag «Буряк» (group 1) between «Морква» and «Цибуля» (group 2)
const handle = await (await page.$('[data-group="0"] li')).$('button[aria-label^="Перетягнути"]');
await handle.evaluate((b) => b.scrollIntoView({ block: 'center' }));
const hb = await handle.boundingBox();
const target = await (await page.$$('[data-group="1"] li'))[1].boundingBox();
const hx = hb.x + hb.width / 2;
const hy = hb.y + hb.height / 2;
// just above the boundary: nearest to «Морква», below its middle
const dy = target.y - 3 - hy;
await page.mouse.move(hx, hy);
await page.mouse.down();
for (let i = 1; i <= 20; i++) {
  await page.mouse.move(hx, hy + (dy * i) / 20);
  await sleep(20);
}
await sleep(200);
await page.mouse.up();
await sleep(400);
eg = await editorGroups();
check('ingredient dragged into another group', JSON.stringify(eg.map((g) => g.rows)) === '[["Картопля"],["Морква","Буряк","Цибуля"],["Сметана"]]', JSON.stringify(eg.map((g) => g.rows)));
await page.screenshot({ path: `${out}/9b-groups-edit.png` });
await page.click('button::-p-text(Готово)');
await page.waitForFunction(() => !location.search.includes('edit'), { timeout: 5000 }).catch(() => null);
await sleep(400);
const savedGroups = (await page.evaluate(async () => (await fetch('/api/recipes/2')).json())).ingredientGroups;
const beet = (gs) => gs.flatMap((g) => g.ingredients).find((i) => i.name === 'Буряк')?.id;
check(
  'groups saved, moved ingredient kept its id',
  JSON.stringify(savedGroups.map((g) => g.name)) === '["","Зажарка","Подача"]' && savedGroups[1].ingredients[1].name === 'Буряк' && beet(savedGroups) === beet(borshch.ingredientGroups),
  JSON.stringify(savedGroups),
);
check('headings after save', JSON.stringify(await groupHeadings()) === '["Інгредієнти №1","Зажарка","Подача"]', JSON.stringify(await groupHeadings()));

// new recipe
await page.goto(base + '/r/new', { waitUntil: 'networkidle0' });
check('tab title for a new recipe', (await page.title()) === 'Новий рецепт — Їжак з макітрою', await page.title());
await page.type('input[placeholder="Назва рецепта"]', 'Деруни');
await page.type('input[placeholder="Інгредієнт"]', 'Картопля');
await page.type('input[placeholder="500 г"]', '1 кг');
await page.type('textarea[placeholder="Опишіть крок"]', 'Натріть картоплю.');
await page.type('input[id^="timer-"]', '1,5');
await page.click('button::-p-text(Готово)');
await page.waitForFunction(() => /\/r\/\d+$/.test(location.pathname), { timeout: 5000 }).catch(() => null);
await sleep(400);
check('new recipe created and opened', /\/r\/\d+$/.test(page.url()), page.url());
const timerLabel = await page.$eval('button[aria-label^="Запустити таймер"]', (b) => b.textContent).catch(() => null);
check('1,5 хв → 1:30 timer', timerLabel === '1:30', timerLabel);

// empty new recipe → nothing created
await page.goto(base + '/r/new', { waitUntil: 'networkidle0' });
await page.click('button::-p-text(Готово)');
await sleep(500);
const count = await page.evaluate(async () => (await (await fetch('/api/recipes')).json()).items.length);
check('tab title back to the app name', (await page.title()) === 'Їжак з макітрою', await page.title());
check('empty new recipe not saved', count === 4 && new URL(page.url()).pathname === '/', `${count} ${page.url()}`);

// delete
await page.goto(base + '/r/3?edit', { waitUntil: 'networkidle0' });
await page.click('button::-p-text(Видалити рецепт)');
await page.waitForSelector('::-p-text(Видалити рецепт?)');
await page.screenshot({ path: `${out}/10-delete-confirm.png` });
await page.click('div[role="alertdialog"] button::-p-text(Видалити)');
await page.waitForFunction(() => location.pathname === '/', { timeout: 5000 }).catch(() => null);
const after = await page.evaluate(async () => (await fetch('/api/recipes/3')).status);
check('recipe deleted', after === 404, after);

// a recipe pasted as plain text (e2e/fixtures/plov.txt) is parsed into the new-recipe form
const plov = readFileSync(new URL('../fixtures/plov.txt', import.meta.url), 'utf8');
await page.goto(base + '/r/new', { waitUntil: 'networkidle0' });
await page.click('button::-p-text(Вставити з тексту)');
await page.waitForSelector('textarea[aria-label], div[role="dialog"] textarea');
// a controlled React field: set through the native setter so React sees the change
await page.$eval(
  'div[role="dialog"] textarea',
  (el, text) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  plov,
);
await sleep(300);
await page.screenshot({ path: `${out}/14-paste-dialog.png` });
await page.click('div[role="dialog"] button::-p-text(Розібрати)');
await sleep(400);
await page.screenshot({ path: `${out}/15-paste-parsed.png` });
check('paste dialog closes', !(await page.$('div[role="dialog"]')));
const form = await page.evaluate(() => ({
  title: document.querySelector('input[placeholder="Назва рецепта"]').value,
  names: [...document.querySelectorAll('input[placeholder="Інгредієнт"]')].map((i) => i.value),
  qtys: [...document.querySelectorAll('input[placeholder="500 г"]')].map((i) => i.value),
  steps: document.querySelectorAll('textarea[placeholder="Опишіть крок"]').length,
  timers: [...document.querySelectorAll('input[id^="timer-"]')].map((i) => i.value),
}));
check('parsed title from «Плов готовий.»', form.title === 'Плов', form.title);
check('parsed 11 ingredients', form.names.length === 11, form.names.length);
check(
  'ingredient units normalised',
  form.names[0] === 'Бараніни або яловичини' && form.qtys[0] === '1 кг' && form.qtys[2] === '300-350 г' &&
    form.names[7] === 'Часника' && form.qtys[7] === '2-3 головки' && form.qtys[9] === '',
  JSON.stringify(form.names.map((n, i) => `${n}|${form.qtys[i]}`)),
);
check('parsed 9 steps', form.steps === 9, form.steps);
check('timers from step text', JSON.stringify(form.timers) === JSON.stringify(['', '60', '', '', '10', '40', '', '', '20']), JSON.stringify(form.timers));

// images pasted from the clipboard: into the focused step, otherwise into the recipe photos;
// text in the clipboard wins over an image that came with it
const pasteImage = (text) =>
  page.evaluate(
    (b64, text) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'image.jpg', { type: 'image/jpeg' }));
      if (text) dt.setData('text/plain', text);
      (document.activeElement ?? document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    readFileSync(`${img}/step1.jpg`).toString('base64'),
    text,
  );
const pastedCounts = () =>
  page.evaluate(() => ({
    recipe: document.querySelectorAll('section[aria-label="Фото страви"] button[aria-label^="Фото"]').length,
    steps: [...document.querySelectorAll('[data-step]')].map((li) => li.querySelectorAll('button[aria-label^="Фото"]').length),
  }));
await page.$$eval('textarea[placeholder="Опишіть крок"]', (ts) => ts[1].focus());
await pasteImage();
await page.$$eval('textarea[placeholder="Опишіть крок"]', (ts) => ts[1].focus());
await pasteImage('просто текст');
await page.focus('input[placeholder="Назва рецепта"]');
await pasteImage();
await page.waitForFunction(() => !document.querySelector('[aria-label*="завантажується"]'), { timeout: 15000 });
const pasted = await pastedCounts();
check('pasted image goes to the focused step', pasted.steps[1] === 1 && pasted.steps.reduce((a, b) => a + b) === 1, JSON.stringify(pasted));
check('pasted image outside steps goes to the recipe', pasted.recipe === 1, JSON.stringify(pasted));
await page.click('button::-p-text(Готово)');
await page.waitForFunction(() => /\/r\/\d+$/.test(location.pathname), { timeout: 5000 }).catch(() => null);
const savedPlov = await page.evaluate(async () => (await fetch('/api/recipes/' + location.pathname.split('/').pop())).json());
check(
  'parsed recipe saved',
  savedPlov.title === 'Плов' && savedPlov.ingredientGroups.length === 1 && savedPlov.ingredientGroups[0].ingredients.length === 11 && savedPlov.steps[1].timerSeconds === 3600 &&
    savedPlov.photos.length === 1 && savedPlov.steps[1].photos.length === 1,
  JSON.stringify({ t: savedPlov.title, i: savedPlov.ingredientGroups?.length, p: savedPlov.photos?.length, s: savedPlov.steps?.[1] }),
);

// «Тісто:» / «Для начинки:» headers in pasted text become named groups
await page.goto(base + '/r/new', { waitUntil: 'networkidle0' });
await page.click('button::-p-text(Вставити з тексту)');
await page.waitForSelector('div[role="dialog"] textarea');
await page.$eval(
  'div[role="dialog"] textarea',
  (el, text) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  readFileSync(new URL('../fixtures/varenyky.txt', import.meta.url), 'utf8'),
);
await page.click('div[role="dialog"] button::-p-text(Розібрати)');
await sleep(400);
const pastedGroups = await editorGroups();
check(
  'pasted text split into groups',
  JSON.stringify(pastedGroups.map((g) => [g.name, g.rows.length])) === '[["Тісто",4],["Для начинки",3]]',
  JSON.stringify(pastedGroups),
);
const filling = await page.$$eval('[data-group="1"] li', (ls) => ls.map((l) => [...l.querySelectorAll('input')].map((i) => i.value).join('|')));
check(
  'quantity after a dash',
  JSON.stringify(filling) === '["Вишні без кісточок|600 г","Цукор|3 ст. л.","Крохмалю|1 ст. л."]',
  JSON.stringify(filling),
);
await page.screenshot({ path: `${out}/16-paste-groups.png` });

// a long library loads page by page while scrolling; a tag starts its own list from the top
await page.evaluate(async () => {
  for (let i = 1; i <= 35; i++) {
    await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Партія ${i}`, description: '', timeText: '', notes: '', servings: 2, tags: ['партія'], photos: [], ingredientGroups: [], steps: [] }),
    });
  }
});
const total = await page.evaluate(async () => (await (await fetch('/api/recipes?limit=100')).json()).items.length);
const rowCount = () => page.$$eval('main ul li a', (as) => as.length);
const scrollUntil = async (n) => {
  for (let i = 0; i < 20 && (await rowCount()) < n; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(150);
  }
  return rowCount();
};
await page.goto(base + '/', { waitUntil: 'networkidle0' });
check('first page only', (await rowCount()) === 30, await rowCount());
check('scrolling loads the rest', (await scrollUntil(total)) === total, `${await rowCount()} of ${total}`);
await page.screenshot({ path: `${out}/21-library-loaded.png` });

// at the very bottom, so the click below does not scroll the row into view first
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await sleep(200);
const scrolled = await page.evaluate(() => window.scrollY);
await page.click('main ul li:last-child a');
await page.waitForFunction(() => location.pathname !== '/');
await sleep(300);
await page.goBack();
await page.waitForFunction(() => location.pathname === '/');
await sleep(400);
const back = await page.evaluate(() => ({ y: window.scrollY, rows: document.querySelectorAll('main ul li a').length }));
check('back returns to the same place in a long list', back.rows === total && Math.abs(back.y - scrolled) < 5, `${JSON.stringify(back)} vs ${scrolled}`);

await page.click('[aria-label="Фільтр за тегами"] button::-p-text(партія)');
await page.waitForFunction(() => document.querySelectorAll('main ul li a').length === 30 && [...document.querySelectorAll('main ul li a')].every((a) => a.textContent.includes('Партія')), { timeout: 5000 }).catch(() => null);
const tagRows = await page.$$eval('main ul li a', (as) => as.map((a) => a.textContent));
check('a tag starts from its first page', tagRows.length === 30 && tagRows[0].includes('Партія 35'), `${tagRows.length} ${tagRows[0]}`);
check('…and loads the rest of the tag', (await scrollUntil(35)) === 35, await rowCount());

// a mouse cannot swipe the tag row: arrows scroll it, shown only towards a side that has more
await page.goto(base + '/', { waitUntil: 'networkidle0' });
const arrows = () => page.$$eval('button[aria-label^="Прокрутити"]', (bs) => bs.map((b) => b.getAttribute('aria-label')));
check('tag row: only the right arrow at the start', JSON.stringify(await arrows()) === '["Прокрутити праворуч"]', JSON.stringify(await arrows()));
await page.click('button[aria-label="Прокрутити праворуч"]');
await sleep(700);
const tagScroll = await page.$eval('[aria-label="Фільтр за тегами"]', (t) => t.scrollLeft);
check('tag row: the arrow scrolls it, the left one appears', tagScroll > 100 && (await arrows()).includes('Прокрутити ліворуч'), `${tagScroll} ${JSON.stringify(await arrows())}`);
await page.screenshot({ path: `${out}/21-tag-arrows.png` });

// wide screens: the library in two columns, row by row; the recipe below its top block splits
// into photos + ingredients on the left and steps on the right; cook mode stays one column
await page.setViewport({ width: 1280, height: 900 });
await page.goto(base + '/', { waitUntil: 'networkidle0' });
const wideRows = await page.$$eval('main ul li', (ls) => ls.slice(0, 3).map((l) => l.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.top)]));
check('wide: library rows fill two columns left to right', wideRows[0][1] === wideRows[1][1] && wideRows[1][0] > wideRows[0][0] && wideRows[2][0] === wideRows[0][0] && wideRows[2][1] > wideRows[0][1], JSON.stringify(wideRows));
await page.screenshot({ path: `${out}/22-wide-library.png` });
await page.goto(base + '/r/2', { waitUntil: 'networkidle0' });
const wideView = await page.evaluate(() => {
  const r = (el) => el.getBoundingClientRect();
  const main = r(document.querySelector('main'));
  const photos = r(document.querySelector('section[aria-label="Фото страви"]'));
  const ing = r(document.querySelector('#ing-h').closest('section'));
  const steps = r(document.querySelector('#steps-h').closest('section'));
  return { main: Math.round(main.width), photosRight: photos.right, ingLeft: ing.left, ingTop: ing.top, photosBottom: photos.bottom, stepsLeft: steps.left, stepsTop: steps.top, photosTop: photos.top };
});
check(
  'wide: photos and ingredients left, steps right',
  wideView.main > 1000 && wideView.stepsLeft > wideView.photosRight && wideView.ingLeft < wideView.stepsLeft && wideView.ingTop > wideView.photosBottom && Math.abs(wideView.stepsTop - wideView.photosTop) < 2,
  JSON.stringify(wideView),
);
await page.screenshot({ path: `${out}/23-wide-recipe.png`, fullPage: true });
await page.goto(base + '/r/2?edit', { waitUntil: 'networkidle0' });
const wideEdit = await page.evaluate(() => ({
  ing: document.querySelector('#ing-h').getBoundingClientRect().left,
  steps: document.querySelector('#steps-h').getBoundingClientRect().left,
}));
check('wide: editor in the same two columns', wideEdit.steps - wideEdit.ing > 500, JSON.stringify(wideEdit));
await page.screenshot({ path: `${out}/24-wide-edit.png`, fullPage: true });
await page.goto(base + '/r/2/cook', { waitUntil: 'networkidle0' });
const cookW = await page.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().width));
check('wide: cook mode stays one narrow column', cookW > 0 && cookW <= 640, cookW);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

check('no page errors', errors.length === 0, errors.join(' | '));

// ---------- dark scheme, taken from the browser setting -------------------------------------------
const dark = await browser.newPage();
await dark.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await dark.goto(base + '/', { waitUntil: 'networkidle0' });
const darkBg = await dark.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('dark scheme follows the browser', darkBg === 'rgb(24, 24, 23)', darkBg);
await dark.screenshot({ path: `${out}/16-dark-library.png` });
await dark.goto(base + '/r/1', { waitUntil: 'networkidle0' });
await sleep(300);
await dark.screenshot({ path: `${out}/17-dark-recipe.png` });
await dark.goto(base + '/r/1?edit', { waitUntil: 'networkidle0' });
await sleep(300);
await dark.screenshot({ path: `${out}/18-dark-edit.png` });
await dark.goto(base + '/r/1/cook', { waitUntil: 'networkidle0' });
await dark.click('button[aria-label="Крок 3"]');
await sleep(450);
await dark.screenshot({ path: `${out}/19-dark-cook.png` });
await dark.goto(base + '/', { waitUntil: 'networkidle0' });
await dark.click('button[aria-label="Обліковий запис"]');
await sleep(300);
await dark.screenshot({ path: `${out}/20-dark-menu.png` });
const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check('light scheme unchanged', lightBg === 'rgb(255, 255, 255)', lightBg);

// ---------- phone (touch): revealed controls, photo source sheet --------------------------------
const phone = await phoneBrowser.newPage();
await phone.emulate({
  viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});

await phone.goto(base + '/r/1', { waitUntil: 'networkidle0' });
await sleep(400);
const navOpacity = await phone.$eval('nav[aria-label="Навігація"]', (n) => getComputedStyle(n).opacity);
check('touch: top bar visible', navOpacity === '1', navOpacity);
await phone.screenshot({ path: `${out}/11-phone-recipe.png` });
await phone.goto(base + '/r/1?edit', { waitUntil: 'networkidle0' });
await phone.tap('button[aria-label="Додати фото рецепта"]');
await sleep(400);
check('touch: photo sheet opens', !!(await phone.$('::-p-text(Зробити фото)')));
await phone.screenshot({ path: `${out}/12-phone-sheet.png` });
await phone.tap('button::-p-text(Скасувати)');
await sleep(400);
check('touch: sheet closes', !(await phone.$('::-p-text(Зробити фото)')));
await phone.goto(base + '/', { waitUntil: 'networkidle0' });
const phoneArrows = await phone.$$eval('button[aria-label^="Прокрутити"]', (bs) => bs.filter((b) => getComputedStyle(b).display !== 'none').length);
check('touch: no tag row arrows, the row is swiped', phoneArrows === 0, phoneArrows);
await phone.evaluate(() => window.scrollTo(0, 900));
await sleep(200);
await phone.screenshot({ path: `${out}/13-phone-edit-lists.png` });

await browser.close();
await phoneBrowser.close();
console.log(ok ? 'ALL OK' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
