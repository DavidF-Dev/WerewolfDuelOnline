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

interface Built {
  /** The URLs that the built page loads. */
  html: string[];
  /** The engine WebAssembly URLs named in the scripts. */
  wasm: string[];
  manifest: { start_url: string; scope: string; theme_color: string };
  /** The service worker URL and scope that the page registers. */
  worker: { url: string; scope: string } | undefined;
}

/** What the built page, its scripts and its manifest load. */
async function assetUrls(outDir: string): Promise<Built> {
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  const scripts = (await readdir(join(outDir, 'assets'))).filter((f) => f.endsWith('.js'));
  const js = (
    await Promise.all(scripts.map((f) => readFile(join(outDir, 'assets', f), 'utf8')))
  ).join('\n');
  const worker = /new \w+\("([^"]+)",\s*\{\s*scope:\s*"([^"]*)"/.exec(js);
  const manifest = await readFile(join(outDir, 'manifest.webmanifest'), 'utf8');
  return {
    html: [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!),
    wasm: [...js.matchAll(/"([^"]*\.wasm)"/g)].map((m) => m[1]!),
    manifest: JSON.parse(manifest) as Built['manifest'],
    worker: worker === null ? undefined : { url: worker[1]!, scope: worker[2]! },
  };
}

const outDirs: string[] = [];

afterAll(async () => {
  for (const dir of outDirs) await rm(dir, { recursive: true, force: true });
});

describe('web build base path', () => {
  let subPath: Built;
  let root: Built;

  beforeAll(async () => {
    const subPathDir = await buildWith('/wwd-project');
    const rootDir = await buildWith(undefined);
    outDirs.push(subPathDir, rootDir);
    subPath = await assetUrls(subPathDir);
    root = await assetUrls(rootDir);
  }, 120_000);

  it('loads every asset from under a project-site sub-path', () => {
    expect(subPath.html.filter((url) => url.startsWith('/wwd-project/assets/'))).not.toEqual([]);
    for (const url of subPath.html) expect(url).toMatch(/^\/wwd-project\/[^/]/);
    expect(subPath.wasm.length).toBeGreaterThan(0);
    for (const url of subPath.wasm) expect(url).toMatch(/^\/wwd-project\/assets\/.+\.wasm$/);
  });

  it('loads every asset from the site root by default', () => {
    expect(root.html.filter((url) => url.startsWith('/assets/'))).not.toEqual([]);
    for (const url of root.html) expect(url).toMatch(/^\/[^/]/);
    expect(root.wasm.length).toBeGreaterThan(0);
    for (const url of root.wasm) expect(url).toMatch(/^\/assets\/.+\.wasm$/);
  });

  it('manifest scope follows the base path', () => {
    for (const built of [subPath, root]) {
      expect(built.manifest).toMatchObject({ start_url: './', scope: './' });
    }
    expect(subPath.html).toContain('/wwd-project/manifest.webmanifest');
    expect(subPath.worker).toEqual({ url: '/wwd-project/sw.js', scope: '/wwd-project/' });
    expect(root.html).toContain('/manifest.webmanifest');
    expect(root.worker).toEqual({ url: '/sw.js', scope: '/' });
  });

  it('takes the manifest theme colour from the app bar token', async () => {
    const tokens = await readFile(join(ROOT, 'src', 'theme', 'tokens.css'), 'utf8');
    const bar = /--bar-a:\s*(#[0-9a-f]{6});/i.exec(tokens)?.[1];
    expect(root.manifest.theme_color).toBe(bar);
  });
});
