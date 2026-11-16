/**
 * Turns a recipe pasted as plain text into editor fields. The shape it expects is the common one
 * in messengers and notes:
 *
 *   Optional title line
 *   • 1кг бараніни          ← bulleted (or "Інгредієнти:"-headed) ingredient lines
 *   • зира
 *
 *   • цибуля — 2 шт.        ← or the name first, then a dash and the amount
 *
 *   Для соусу:              ← a short line ending in a colon, followed by ingredient lines,
 *   • 2 ст. л. соєвого        starts a named group
 *
 *   Paragraph per step, or numbered lines ("1.", "2)", "Крок 3:")
 *
 * Everything is a best guess for the user to review in the editor before saving; nothing here is
 * allowed to throw on odd input.
 */

export type ParsedRecipe = {
  title: string;
  timeText: string;
  servings?: number;
  ingredientGroups: { name: string; ingredients: { name: string; quantity: string }[] }[];
  steps: { text: string; timerMinutes?: number }[];
};

const BULLET = /^\s*[•●▪◦·*\-–—]\s*/;
const NUMBERED = /^\s*(?:крок\s*)?\d{1,2}\s*[.):]\s*/i;
const INGREDIENTS_HEADER = /^\s*(інгредієнти|ингредиенты|продукти|склад)\s*:?\s*$/i;
const STEPS_HEADER = /^\s*(приготування|спосіб приготування|приготовление|як готувати)\s*:?\s*$/i;
const GROUP_HEADER = /^\s*([^\d•●▪◦·*\-–—].{0,39}?)\s*:\s*$/;
const SERVINGS = /(?:на\s+)?(\d{1,2})\s+порці[йюї]|порці[йї]\s*:\s*(\d{1,2})/i;
const TIME_LINE = /^\s*(?:час(?:\s+приготування)?|время)\s*:\s*(.+)$/i;

const NUMBER = String.raw`\d+(?:[.,]\d+)?|½|¼|¾`;

/**
 * Units as written → as shown. Longer spellings first so «гр» is not read as «г» + «р…».
 * Count words («головки», «зубчики») stay as written: they are part of the quantity.
 */
const UNITS: [RegExp, string | null][] = [
  [/^(?:ст\.?\s*л\.?|столов\p{L}*\s+ложк\p{L}*)/iu, 'ст. л.'],
  [/^(?:ч\.?\s*л\.?|чайн\p{L}*\s+ложк\p{L}*)/iu, 'ч. л.'],
  [/^(?:кг|кілограм\p{L}*)\.?(?!\p{L})/iu, 'кг'],
  [/^(?:гр|грам\p{L}*|г)\.?(?!\p{L})/iu, 'г'],
  [/^(?:мл|мілілітр\p{L}*)\.?(?!\p{L})/iu, 'мл'],
  [/^(?:л|літр\p{L}*)\.?(?!\p{L})/iu, 'л'],
  [/^(?:шт|штук\p{L}*)\.?(?!\p{L})/iu, 'шт'],
  [/^(?:склянк|стакан|головк|зубч|пуч|пачк|банк|дрібк|щіпк|жмен)\p{L}*/iu, null],
];

const upperFirst = (s: string) => (s ? s[0]!.toLocaleUpperCase('uk') + s.slice(1) : s);
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();
const fraction = (s: string) =>
  ({ '½': '0,5', '¼': '0,25', '¾': '0,75' })[s] ?? s.replace('.', ',');

const AMOUNT = new RegExp(`^(${NUMBER})(?:\\s*[-–]\\s*(${NUMBER}))?\\s*`);

/**
 * «2 шт. цибулі» → { amount: «2 шт», rest: «цибулі» }: a leading number (or range) and the unit
 * right after it; null when the text does not start with a number.
 */
function leadingAmount(text: string): { amount: string; rest: string } | null {
  const m = AMOUNT.exec(text);
  if (!m) {
    return null;
  }
  let amount = fraction(m[1]!);
  if (m[2]) {
    amount += '-' + fraction(m[2]);
  }
  let rest = text.slice(m[0].length);

  for (const [re, unit] of UNITS) {
    const u = re.exec(rest);
    if (u) {
      amount += ' ' + (unit ?? u[0].toLowerCase());
      rest = rest.slice(u[0].length).replace(/^[\s.,]+/, '');
      break;
    }
  }
  return { amount, rest };
}

/**
 * The name, a dash, then the amount: «цибуля — 2 шт.». A hyphen counts only with a space before
 * it, so «дев-зіра» is not split.
 */
const NAME_DASH_AMOUNT = new RegExp(`^(.+?)(?:\\s+[-–—]|\\s*[–—])\\s*((?:${NUMBER}).*)$`, 'u');

/**
 * «1кг бараніни» → { name: «Бараніни», quantity: «1 кг» }; «фіолетова цибуля — 2 шт.» →
 * { name: «Фіолетова цибуля», quantity: «2 шт» }; no number in either place → no quantity.
 */
export function parseIngredient(line: string): { name: string; quantity: string } {
  const text = tidy(line.replace(BULLET, ''));
  const lead = leadingAmount(text);
  if (lead) {
    return { name: upperFirst(tidy(lead.rest)) || upperFirst(text), quantity: lead.amount };
  }

  const dash = NAME_DASH_AMOUNT.exec(text);
  const tail = dash ? leadingAmount(dash[2]!) : null;
  if (dash && tail) {
    // whatever follows the unit («— 2 шт. середні») still describes the ingredient
    const extra = tidy(tail.rest.replace(/[\s.,;]+$/, ''));
    return {
      name: upperFirst(extra ? `${tidy(dash[1]!)}, ${extra}` : tidy(dash[1]!)),
      quantity: tail.amount,
    };
  }

  // «сіль за смаком» / «зира»: a trailing «за смаком» is the quantity
  const toTaste = /^(.*?)[\s,—–-]*(за смаком|по смаку|дрібка|щіпка)$/iu.exec(text);
  if (toTaste && toTaste[1]) {
    return { name: upperFirst(toTaste[1]), quantity: toTaste[2]!.toLowerCase() };
  }
  return { name: upperFirst(text), quantity: '' };
}

const DURATION = new RegExp(
  `(${NUMBER})(?:\\s*[-–]\\s*(?:${NUMBER}))?\\s*(хв|хвилин\\p{L}*|мин\\p{L}*|год\\p{L}*|час\\p{L}*|сек\\p{L}*)`,
  'iu',
);

/**
 * The first duration mentioned in a step, in minutes. A range gives its lower end — the timer is
 * for «check now», and checking early is safer than late.
 */
export function stepMinutes(text: string): number | undefined {
  const m = DURATION.exec(text);
  if (m) {
    const n = parseFloat(fraction(m[1]!).replace(',', '.'));
    const unit = m[2]!.toLowerCase();
    if (unit.startsWith('год') || unit.startsWith('час')) {
      return n * 60;
    }
    if (unit.startsWith('сек')) {
      return Math.max(1, Math.round(n / 60));
    }
    return n;
  }
  if (/пів\s*години/i.test(text)) {
    return 30;
  }
  if (/(?:на|за|протягом)\s+годину/i.test(text)) {
    return 60;
  }
  return undefined;
}

/** «Плов готовий.» / «Борщ готовий!» — a closing line that names the dish. */
const DONE_LINE = /^\s*([^\s.,!].{0,40}?)\s+(?:готов(?:ий|а|е|і)|готов)\s*[.!]*\s*$/i;

const looksLikeTitle = (line: string) =>
  line.length > 0 &&
  line.length <= 60 &&
  !BULLET.test(line) &&
  !NUMBERED.test(line) &&
  !/[.:;]$/.test(line.trim()) &&
  !/^\d/.test(line.trim());

export function parseRecipe(input: string): ParsedRecipe {
  const result: ParsedRecipe = { title: '', timeText: '', ingredientGroups: [], steps: [] };
  const groups = result.ingredientGroups;
  const addIngredient = (line: string) => {
    if (!groups.length) {
      groups.push({ name: '', ingredients: [] });
    }
    groups[groups.length - 1]!.ingredients.push(parseIngredient(line));
  };
  const startGroup = (name: string) => {
    const last = groups[groups.length - 1];
    // a header right after another (or before any row) names the group still empty
    if (last && !last.ingredients.length) {
      last.name = name;
    } else {
      groups.push({ name, ingredients: [] });
    }
  };
  const lines = input.replace(/\r\n?/g, '\n').split('\n');

  // paragraphs: runs of non-empty lines
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line) {
      cur.push(line);
    } else if (cur.length) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) {
    blocks.push(cur);
  }

  // a short first line followed by more text is the title
  if (blocks.length > 1 || (blocks[0]?.length ?? 0) > 1) {
    const first = blocks[0]![0]!;
    if (looksLikeTitle(first) && !INGREDIENTS_HEADER.test(first) && !STEPS_HEADER.test(first)) {
      result.title = tidy(first);
      blocks[0]!.shift();
      if (!blocks[0]!.length) {
        blocks.shift();
      }
    }
  }

  type Mode = 'auto' | 'ingredients' | 'steps';
  let mode: Mode = 'auto';
  const stepTexts: string[] = [];

  for (const [bi, block] of blocks.entries()) {
    let addedIngredients = false;
    // no bullets and no header, but several short lines that are not sentences: a list
    const plainList =
      mode === 'auto' &&
      groups.length === 0 &&
      stepTexts.length === 0 &&
      block.length >= 2 &&
      block.every((l) => l.length <= 60 && !/[.:;!?]$/.test(l) && !NUMBERED.test(l));
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) {
        stepTexts.push(paragraph.join(' '));
        paragraph = [];
      }
    };

    for (const [li, line] of block.entries()) {
      if (INGREDIENTS_HEADER.test(line)) {
        flush();
        mode = 'ingredients';
        continue;
      }
      if (STEPS_HEADER.test(line)) {
        flush();
        mode = 'steps';
        continue;
      }
      // «Тісто:» / «Для начинки:» — only when ingredient lines follow (the header may stand alone
      // with a blank line after it), so a step ending in a colon stays a step
      const group = GROUP_HEADER.exec(line);
      const next = li + 1 < block.length ? block[li + 1] : blocks[bi + 1]?.[0];
      if (
        group &&
        mode !== 'steps' &&
        next !== undefined &&
        (BULLET.test(next) || (mode === 'ingredients' && !NUMBERED.test(next)))
      ) {
        flush();
        startGroup(upperFirst(tidy(group[1]!)));
        mode = 'ingredients';
        continue;
      }
      const time = TIME_LINE.exec(line);
      if (time && !result.timeText) {
        result.timeText = tidy(time[1]!);
        continue;
      }
      const servings = SERVINGS.exec(line);
      if (servings && line.length < 40 && result.servings === undefined) {
        result.servings = Number(servings[1] ?? servings[2]);
        continue;
      }

      const bulleted = BULLET.test(line);
      if (
        (bulleted && mode !== 'steps') ||
        (mode === 'ingredients' && !NUMBERED.test(line)) ||
        plainList
      ) {
        flush();
        addIngredient(line);
        addedIngredients = true;
        continue;
      }
      if (NUMBERED.test(line) || bulleted) {
        // each numbered (or, under a steps header, bulleted) line starts a new step
        flush();
        paragraph.push(line.replace(NUMBERED, '').replace(BULLET, ''));
        continue;
      }
      if (mode === 'ingredients') {
        mode = 'steps';
      }
      paragraph.push(line);
    }
    flush();
    // a blank line after ingredient lines ends the list (a lone header line does not)
    if (mode === 'ingredients' && addedIngredients) {
      mode = 'auto';
    }
  }

  // «Плов готовий.» at the end: the dish's name, not a step
  const last = stepTexts[stepTexts.length - 1];
  const done = last ? DONE_LINE.exec(last) : null;
  if (done) {
    stepTexts.pop();
    if (!result.title) {
      result.title = upperFirst(tidy(done[1]!));
    }
  }

  result.steps = stepTexts.map((text) => ({ text: tidy(text), timerMinutes: stepMinutes(text) }));
  return result;
}
