// Captures every gallery entry and the mockups, side by side, with a contact sheet linking them.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = new URL('../visual-output/', import.meta.url);
const MOCKUPS = new URL('../../../../docs/mockups/mockups.html', import.meta.url);
/** Named sections of other mockup files, drawn in the light look only. */
const REFERENCES = {
  'cards-H': {
    file: new URL('../../../../docs/mockups/cards-and-plan.html', import.meta.url),
    selector: '#tokensH figure',
  },
};

const SIZES = [
  { width: 360, height: 640 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
];
/** Each look's `data-theme` and `data-contrast`, and the mockup look it is compared with. */
const LOOKS = {
  light: { theme: 'light', contrast: null, mockup: 'light', label: 'light' },
  dark: { theme: 'dark', contrast: null, mockup: 'dark', label: 'dark' },
  hc: { theme: 'dark', contrast: 'high', mockup: 'dark', label: 'dark, high contrast' },
};
const MOCKUP_LOOKS = ['light', 'dark'];
const COMPARE_SIZE = '360x740';
const PARALLEL_PAGES = 4;
/** Entries captured as the whole page, not only the viewport. */
const FULL_PAGE = new Set(['cards']);
/** Entries whose scroll position is what they show. */
const KEEP_SCROLL = new Set(['settings-scrolled']);

const sizeName = ({ width, height }) => `${width}x${height}`;
const out = (path) => fileURLToPath(new URL(path, OUT));
const escape = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const frames = () =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Sets the look on the page's root element, as the settings would. */
async function applyLook(page, look) {
  await page.evaluate(({ theme, contrast }) => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (contrast === null) delete root.dataset.contrast;
    else root.dataset.contrast = contrast;
  }, look);
  await page.evaluate(frames);
}

/** Runs `task` on every item, at most `limit` at a time. */
async function inParallel(items, limit, task) {
  const queue = [...items];
  const workers = Array.from({ length: limit }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  });
  await Promise.all(workers);
}

async function listEntries(context, base) {
  const page = await context.newPage();
  await page.goto(`${base}#/dev/gallery`);
  await page.locator('[data-entry]').first().waitFor();
  const entries = await page.locator('[data-entry]').evaluateAll((items) =>
    items.map((item) => ({
      id: item.dataset.entry,
      title: item.querySelector('a')?.textContent ?? '',
      mockup:
        item.dataset.mockup === undefined
          ? null
          : /^\d+$/.test(item.dataset.mockup)
            ? Number(item.dataset.mockup)
            : item.dataset.mockup,
      game: item.dataset.game === 'true',
    })),
  );
  await page.close();
  return entries;
}

async function captureMockups(context) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(MOCKUPS.href);
  await mkdir(out('mockups'), { recursive: true });
  const phones = page.locator('figure .phone');
  const count = await phones.count();
  for (const look of MOCKUP_LOOKS) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, look);
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < count; i++) {
      await phones.nth(i).screenshot({ path: out(`mockups/${i + 1}-${look}.png`) });
    }
  }
  for (const [name, { file, selector }] of Object.entries(REFERENCES)) {
    await page.goto(file.href);
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator(selector)
      .first()
      .screenshot({ path: out(`mockups/${name}-light.png`) });
  }
  await page.close();
  return count;
}

async function captureEntry(context, base, entry, size) {
  const page = await context.newPage();
  try {
    await page.setViewportSize(size);
    await page.goto(`${base}#/dev/gallery/${entry.id}`);
    await page.waitForFunction(
      (id) =>
        document.documentElement.dataset.galleryReady === id ||
        document.documentElement.dataset.galleryError === id,
      entry.id,
    );
    const failed = await page.evaluate(() => document.documentElement.dataset.galleryError);
    if (failed !== undefined) throw new Error(`the gallery entry ${entry.id} failed to render`);
    await page.evaluate(() => document.fonts.ready);
    for (const [name, look] of Object.entries(LOOKS)) {
      await applyLook(page, look);
      if (!KEEP_SCROLL.has(entry.id)) {
        // Focus moved to the first action scrolls the page, but captures compare from the top.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(frames);
      }
      await page.screenshot({
        path: out(`${entry.id}/${sizeName(size)}-${name}.png`),
        fullPage: FULL_PAGE.has(entry.id),
      });
    }
  } finally {
    await page.close();
  }
}

/** Writes the mockup and the app side by side for each look of an entry with a mockup. */
async function compare(context, entry) {
  const page = await context.newPage();
  const image = async (path) =>
    `data:image/png;base64,${(await readFile(out(path))).toString('base64')}`;
  for (const [name, look] of Object.entries(LOOKS)) {
    const mockupLook = entry.mockup in REFERENCES ? 'light' : look.mockup;
    const mockup = await image(`mockups/${entry.mockup}-${mockupLook}.png`);
    const app = await image(`${entry.id}/${COMPARE_SIZE}-${name}.png`);
    await page.setContent(`<!doctype html>
      <body style="margin:0;padding:12px;background:#888;font:14px system-ui,sans-serif;display:flex;gap:16px">
        <figure style="margin:0"><figcaption>Mockup ${entry.mockup} (${mockupLook})</figcaption><img src="${mockup}"></figure>
        <figure style="margin:0"><figcaption>App at ${COMPARE_SIZE} (${escape(look.label)})</figcaption><img src="${app}"></figure>
      </body>`);
    await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
    await page.screenshot({ path: out(`${entry.id}/compare-${name}.png`), fullPage: true });
  }
  await page.close();
}

function contactSheet(entries, mockupCount) {
  const img = (path, width) =>
    `<a href="${path}"><img src="${path}" width="${width}" loading="lazy" alt=""></a>`;
  const mockups = Array.from({ length: mockupCount }, (_, i) =>
    MOCKUP_LOOKS.map((look) => img(`mockups/${i + 1}-${look}.png`, 120)).join(''),
  ).join('');
  const sections = entries.map((entry) => {
    const compares =
      entry.mockup === null
        ? ''
        : `<p>${Object.keys(LOOKS)
            .map((name) => img(`${entry.id}/compare-${name}.png`, 240))
            .join('')}</p>`;
    const rows = SIZES.map(
      (size) =>
        `<tr><th>${sizeName(size)}</th>${Object.keys(LOOKS)
          .map((name) => `<td>${img(`${entry.id}/${sizeName(size)}-${name}.png`, 160)}</td>`)
          .join('')}</tr>`,
    ).join('');
    const notes = [
      entry.mockup === null ? null : `mockup ${entry.mockup}`,
      entry.game ? 'game screen: no scrolling' : null,
    ].filter((note) => note !== null);
    return `<section id="${entry.id}">
      <h2>${escape(entry.title)} <code>${entry.id}</code>${notes.length > 0 ? ` (${notes.join('; ')})` : ''}</h2>
      ${compares}
      <table><tr><th></th>${Object.values(LOOKS)
        .map((look) => `<th>${escape(look.label)}</th>`)
        .join('')}</tr>${rows}</table>
    </section>`;
  });
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Visual comparison</title>
<style>body{font:14px system-ui,sans-serif;margin:16px}img{vertical-align:top;margin:2px;border:1px solid #ccc}th{text-align:left;font-weight:600}</style>
</head>
<body>
<h1>Visual comparison</h1>
<nav><ul>${entries.map((e) => `<li><a href="#${e.id}">${escape(e.title)}</a></li>`).join('')}</ul></nav>
<section><h2>Mockups</h2><p>${mockups}</p></section>
${sections.join('\n')}
</body>
</html>
`;
}

/** Output of other scripts that shares the folder. */
const KEEP_OUTPUT = new Set(['transcripts']);

const started = Date.now();
await mkdir(OUT, { recursive: true });
for (const name of await readdir(OUT)) {
  if (!KEEP_OUTPUT.has(name)) await rm(out(name), { recursive: true, force: true });
}
const server = await createServer({ root: WEB_ROOT, logLevel: 'warn', clearScreen: false });
let browser;
try {
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (base === undefined) throw new Error('the dev server has no local address');
  browser = await chromium.launch();
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  const entries = await listEntries(context, base);
  const mockupCount = await captureMockups(context);
  for (const entry of entries) await mkdir(out(entry.id), { recursive: true });
  const jobs = entries.flatMap((entry) => SIZES.map((size) => ({ entry, size })));
  await inParallel(jobs, PARALLEL_PAGES, ({ entry, size }) =>
    captureEntry(context, base, entry, size),
  );
  const compared = entries.filter((entry) => entry.mockup !== null);
  for (const entry of compared) await compare(context, entry);
  await writeFile(out('index.html'), contactSheet(entries, mockupCount));
  const images =
    mockupCount * MOCKUP_LOOKS.length +
    jobs.length * Object.keys(LOOKS).length +
    compared.length * Object.keys(LOOKS).length;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`wrote ${images} images for ${entries.length} entries in ${seconds} s`);
  console.log(`open ${out('index.html')}`);
} finally {
  await browser?.close();
  await server.close();
}
