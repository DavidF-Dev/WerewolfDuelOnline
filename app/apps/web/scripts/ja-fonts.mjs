// The Japanese font faces, the text they must cover, and the check of the committed subsets.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('..', import.meta.url));
export const FONTS_DIR = join(WEB, 'src', 'theme', 'ja-fonts');
export const MANIFEST = 'manifest.json';
/** The fonts' licence and copyright notices, which travel with the subsets. */
export const LICENCE = 'OFL.txt';
export const REGENERATE = 'pnpm --filter @wwd/web fonts:ja';

/**
 * The faces: each one's source font (package and file), family, weight and subset file. A face
 * with a `fallback` may lack a character that the fallback face of its weight has, since every
 * font stack names that face after it.
 */
export const JAPANESE_FONTS = [
  {
    source: '@expo-google-fonts/biz-udpgothic/400Regular/BIZUDPGothic_400Regular.ttf',
    family: 'BIZ UDPGothic',
    weight: 400,
    file: 'biz-udpgothic-ja-400.woff2',
  },
  {
    source: '@expo-google-fonts/biz-udpgothic/700Bold/BIZUDPGothic_700Bold.ttf',
    family: 'BIZ UDPGothic',
    weight: 700,
    file: 'biz-udpgothic-ja-700.woff2',
  },
  {
    source: '@expo-google-fonts/shippori-mincho-b1/700Bold/ShipporiMinchoB1_700Bold.ttf',
    family: 'Shippori Mincho B1',
    weight: 700,
    file: 'shippori-mincho-b1-ja-700.woff2',
    fallback: 'BIZ UDPGothic',
  },
];

/** The files whose text is shown in Japanese: the messages, and the language names. */
const SOURCES = [
  '../../../engine/locales/ja/engine.ftl',
  '../../packages/client-core/locales/ja/ui.ftl',
  'src/settings/language.svelte.ts',
];

const range = (from, to) =>
  Array.from({ length: to - from + 1 }, (_, i) => String.fromCodePoint(from + i)).join('');

/**
 * Characters any Japanese text may need beyond the messages: ASCII, kana, punctuation, the
 * full-width forms, and the words of dates and times however a browser's formatter writes them.
 */
const ALWAYS =
  range(0x20, 0x7e) +
  range(0x3041, 0x3096) +
  range(0x30a1, 0x30fa) +
  'ー・、。「」『』（）［］｛｝〈〉《》【】〜！？：；，．＃％＆＊＋－＝／＠' +
  '…‥—–‐→←↑↓×÷±°′″©·“”‘’' +
  range(0xff01, 0xff5e) +
  '年月日時間分秒前後週曜火水木金土今昨明午先来去毎';

const SAMPLE_NOW = Date.UTC(2026, 10, 26, 9, 30);
const DAY_MS = 86_400_000;

/**
 * What this Node's `ja-JP` formatters write for a sweep of samples, in every form the app uses
 * and the forms close to them: relative times, dates and times, numbers and lists. Regenerating
 * the subsets records it in the manifest, so the check does not depend on the Node it runs in.
 */
export function sweptIntlText() {
  const out = [];
  for (const numeric of ['always', 'auto']) {
    const relative = new Intl.RelativeTimeFormat('ja-JP', { numeric });
    for (const unit of ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']) {
      for (const n of [-59, -30, -2, -1, 0, 1, 2, 30]) out.push(relative.format(n, unit));
    }
  }
  const dateOptions = [
    { day: 'numeric', month: 'short' },
    { day: 'numeric', month: 'short', year: 'numeric' },
    { dateStyle: 'short' },
    { dateStyle: 'medium' },
    { dateStyle: 'long' },
    { dateStyle: 'full' },
    { timeStyle: 'short' },
    { dateStyle: 'medium', timeStyle: 'short' },
    { weekday: 'long' },
    { weekday: 'short' },
  ];
  for (const options of dateOptions) {
    const format = new Intl.DateTimeFormat('ja-JP', options);
    for (let day = 0; day < 400; day += 13) out.push(format.format(SAMPLE_NOW - day * DAY_MS));
  }
  for (const options of [{ maximumFractionDigits: 1 }, { style: 'percent' }, {}]) {
    const format = new Intl.NumberFormat('ja-JP', options);
    for (const n of [0, 0.5, 1, 2.5, 20.33, 1234.5, 1e6]) out.push(format.format(n));
  }
  for (const type of ['conjunction', 'disjunction', 'unit']) {
    out.push(new Intl.ListFormat('ja-JP', { type }).format(['A', 'B', 'C']));
  }
  return [...new Set(out.join(''))].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

/** The formatter text recorded in the manifest in `dir`, or undefined when there is none. */
function recordedIntlText(dir = FONTS_DIR) {
  try {
    const { intl } = JSON.parse(readFileSync(join(dir, MANIFEST), 'utf8'));
    return typeof intl === 'string' ? intl : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Every character the app's Japanese text uses, with `ALWAYS` and `intl`, the formatter text (by
 * default the text recorded with the committed subsets), each once, in code point order.
 */
export function japaneseText({ intl = recordedIntlText() ?? '' } = {}) {
  const characters = new Set(ALWAYS + intl);
  for (const source of SOURCES) {
    for (const line of readFileSync(join(WEB, source), 'utf8').split(/\r?\n/)) {
      if (line.trimStart().startsWith('#') || line.trimStart().startsWith('//')) continue;
      for (const character of line) if (character.codePointAt(0) >= 0x20) characters.add(character);
    }
  }
  return [...characters].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

export const codePoint = (character) =>
  `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The characters of `text` that neither `face` nor, for a face with a fallback, the fallback face
 * of its weight among `faces` maps; each face has the `characters` its subset maps.
 */
export function missingCharacters(text, face, faces) {
  const fallback = faces.find((f) => f.family === face.fallback && f.weight === face.weight);
  return [...text].filter(
    (c) => !face.characters.includes(c) && !(fallback?.characters.includes(c) ?? false),
  );
}

/**
 * Checks the committed subsets in `dir`: each file must be the one the manifest describes, and
 * together they must map every character of `text`, by default the Japanese text with the
 * formatter text the manifest records. Rejects with what is wrong and how to fix it.
 */
export async function checkJapaneseFonts({ dir = FONTS_DIR, text } = {}) {
  const fix = `Run \`${REGENERATE}\` to regenerate the Japanese font subsets.`;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, MANIFEST), 'utf8'));
  } catch {
    throw new Error(`The Japanese font subsets have no readable ${MANIFEST}. ${fix}`);
  }
  const problems = [];
  if (text === undefined) {
    if (typeof manifest.intl !== 'string') {
      problems.push(`${MANIFEST} has no recorded formatter text`);
    }
    text = japaneseText({ intl: manifest.intl ?? '' });
  }
  const notice = await readFile(join(dir, LICENCE), 'utf8').catch(() => '');
  if (!notice.includes('SIL Open Font License')) problems.push(`${LICENCE} is missing`);
  for (const font of JAPANESE_FONTS) {
    const face = manifest.fonts.find((f) => f.file === font.file);
    if (face === undefined) {
      problems.push(`${font.file} is not in ${MANIFEST}`);
      continue;
    }
    const bytes = await readFile(join(dir, font.file)).catch(() => null);
    if (bytes === null) problems.push(`${font.file} is missing`);
    else if (sha256(bytes) !== face.sha256)
      problems.push(`${font.file} does not match ${MANIFEST}`);
    const missing = missingCharacters(text, { ...font, ...face }, manifest.fonts);
    if (missing.length > 0) {
      problems.push(
        `${font.family} ${font.weight} has no glyph for ${missing.map((c) => `${codePoint(c)} "${c}"`).join(', ')}`,
      );
    }
  }
  if (problems.length > 0) throw new Error(`${problems.join('; ')}. ${fix}`);
  return manifest.fonts;
}

/** Records this Node's formatter text in the manifest in `dir`, keeping the rest of it. */
export async function recordIntlText(dir = FONTS_DIR) {
  const path = join(dir, MANIFEST);
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(
    path,
    `${JSON.stringify({ ...manifest, intl: sweptIntlText() }, null, 2)}
`,
  );
}
