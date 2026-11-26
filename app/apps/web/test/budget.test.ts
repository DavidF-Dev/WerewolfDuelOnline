// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const KB = 1024;
const INITIAL_LOAD_BUDGET = 350 * KB;
const WASM_BUDGET = 150 * KB;

interface ManifestChunk {
  file: string;
  css?: string[];
  assets?: string[];
  imports?: string[];
}

/** The gzipped size of each file that the built page loads at start, by output path. */
async function initialLoad(outDir: string): Promise<Map<string, number>> {
  const manifest = JSON.parse(
    await readFile(join(outDir, '.vite', 'manifest.json'), 'utf8'),
  ) as Record<string, ManifestChunk>;
  const files = new Set<string>(['index.html']);
  const visit = (key: string): void => {
    const chunk = manifest[key];
    if (chunk === undefined || files.has(chunk.file)) return;
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const asset of chunk.assets ?? []) if (asset.endsWith('.wasm')) files.add(asset);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit('index.html');
  // The browser fetches only the woff2 sources of the fonts the start-up stylesheets name.
  for (const css of [...files].filter((file) => file.endsWith('.css'))) {
    const text = await readFile(join(outDir, css), 'utf8');
    for (const match of text.matchAll(/url\(([^)]+\.woff2)\)/g)) {
      files.add(join('assets', match[1]!.split('/').at(-1)!).replaceAll('\\', '/'));
    }
  }
  const sizes = new Map<string, number>();
  for (const file of files) {
    sizes.set(file, gzipSync(await readFile(join(outDir, file)), { level: 9 }).length);
  }
  return sizes;
}

let outDir: string;
let sizes: Map<string, number>;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'wwd-web-budget-'));
  const previous = process.env.BASE_PATH;
  delete process.env.BASE_PATH;
  try {
    await build({
      root: ROOT,
      configFile: join(ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true, manifest: true },
    });
  } finally {
    if (previous !== undefined) process.env.BASE_PATH = previous;
  }
  sizes = await initialLoad(outDir);
}, 120_000);

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe('performance budget', () => {
  it('initial load fits the budget', () => {
    const kinds = ['.js', '.css', '.wasm', '.woff2'];
    for (const kind of kinds) {
      expect(
        [...sizes.keys()].some((file) => file.endsWith(kind)),
        kind,
      ).toBe(true);
    }
    const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
    const wasm = [...sizes].filter(([file]) => file.endsWith('.wasm'));
    const wasmTotal = wasm.reduce((sum, [, size]) => sum + size, 0);
    const breakdown = [...sizes].map(([file, size]) => `${file}: ${size}`).join('\n');
    expect(total, `initial load ${total} bytes gzipped:\n${breakdown}`).toBeLessThanOrEqual(
      INITIAL_LOAD_BUDGET,
    );
    expect(wasmTotal, `engine WebAssembly ${wasmTotal} bytes gzipped`).toBeLessThanOrEqual(
      WASM_BUDGET,
    );
  });

  it('loads no reading font that is fetched on demand', () => {
    for (const file of sizes.keys()) expect(file).not.toMatch(/lexend|opendyslexic/i);
  });

  it('starts with the English text only, and no Japanese font', async () => {
    for (const file of sizes.keys()) expect(file).not.toMatch(/biz-udpgothic|shippori|ja-fonts/i);
    const scripts = [...sizes.keys()].filter((file) => file.endsWith('.js'));
    const text = (
      await Promise.all(scripts.map((file) => readFile(join(outDir, file), 'utf8')))
    ).join('\n');
    expect(text).toContain('interface text (British English');
    expect(text).not.toContain('interface text (German');
    expect(text).not.toContain('engine text (German');
    expect(text).not.toContain('interface text (Japanese');
    expect(text).not.toContain('engine text (Japanese');
  });

  it('builds the German and Japanese text and the Japanese fonts as files of their own', async () => {
    const assets = await readdir(join(outDir, 'assets'));
    const scripts = await Promise.all(
      assets
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFile(join(outDir, 'assets', file), 'utf8')),
    );
    for (const header of ['interface text (German', 'interface text (Japanese'])
      expect(
        scripts.filter((text) => text.includes(header)),
        header,
      ).toHaveLength(1);
    const fonts = assets.filter((file) =>
      /^(biz-udpgothic|shippori-mincho-b1)-.*\.woff2$/.test(file),
    );
    expect(fonts).toHaveLength(3);
  });
});
