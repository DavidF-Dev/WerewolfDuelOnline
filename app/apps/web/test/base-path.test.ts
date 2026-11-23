// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Builds the app with `BASE_PATH` set to `basePath` and returns the output directory. */
async function buildWith(basePath: string | undefined): Promise<string> {
  const outDir = await mkdtemp(join(tmpdir(), 'wwd-web-base-'));
  const previous = process.env.BASE_PATH;
  if (basePath === undefined) delete process.env.BASE_PATH;
  else process.env.BASE_PATH = basePath;
  try {
    await build({
      root: ROOT,
      configFile: join(ROOT, 'vite.config.ts'),
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  } finally {
    if (previous === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previous;
  }
  return outDir;
}

/** The URLs that the built page and its scripts load. */
async function assetUrls(outDir: string): Promise<{ html: string[]; wasm: string[] }> {
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  const scripts = (await readdir(join(outDir, 'assets'))).filter((f) => f.endsWith('.js'));
  const js = (
    await Promise.all(scripts.map((f) => readFile(join(outDir, 'assets', f), 'utf8')))
  ).join('\n');
  return {
    html: [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!),
    wasm: [...js.matchAll(/"([^"]*\.wasm)"/g)].map((m) => m[1]!),
  };
}

const outDirs: string[] = [];

afterAll(async () => {
  for (const dir of outDirs) await rm(dir, { recursive: true, force: true });
});

describe('web build base path', () => {
  let subPath: { html: string[]; wasm: string[] };
  let root: { html: string[]; wasm: string[] };

  beforeAll(async () => {
    const subPathDir = await buildWith('/wwd-project');
    const rootDir = await buildWith(undefined);
    outDirs.push(subPathDir, rootDir);
    subPath = await assetUrls(subPathDir);
    root = await assetUrls(rootDir);
  }, 120_000);

  it('loads every asset from under a project-site sub-path', () => {
    expect(subPath.html.length).toBeGreaterThan(0);
    for (const url of subPath.html) expect(url).toMatch(/^\/wwd-project\/assets\//);
    expect(subPath.wasm.length).toBeGreaterThan(0);
    for (const url of subPath.wasm) expect(url).toMatch(/^\/wwd-project\/assets\/.+\.wasm$/);
  });

  it('loads every asset from the site root by default', () => {
    expect(root.html.length).toBeGreaterThan(0);
    for (const url of root.html) expect(url).toMatch(/^\/assets\//);
    expect(root.wasm.length).toBeGreaterThan(0);
    for (const url of root.wasm) expect(url).toMatch(/^\/assets\/.+\.wasm$/);
  });
});
