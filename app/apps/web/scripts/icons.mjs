// Renders the app icon PNGs from their SVG sources with Playwright's Chromium.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ICONS = new URL('../public/icons/', import.meta.url);

/** Each PNG to write: its source SVG and its size in pixels. */
const OUTPUTS = [
  { file: 'icon-192.png', source: 'icon.svg', size: 192 },
  { file: 'icon-512.png', source: 'icon.svg', size: 512 },
  { file: 'maskable-512.png', source: 'maskable.svg', size: 512 },
  // iOS draws its own rounded corners and fills transparency with black, so it gets the full square.
  { file: 'apple-touch-icon.png', source: 'maskable.svg', size: 180 },
];

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const { file, source, size } of OUTPUTS) {
    const svg = (await readFile(new URL(source, ICONS))).toString('base64');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0"><img src="data:image/svg+xml;base64,${svg}" width="${size}" height="${size}" style="display:block"></body>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: fileURLToPath(new URL(file, ICONS)), omitBackground: true });
    console.log(`wrote ${file}`);
  }
} finally {
  await browser.close();
}
