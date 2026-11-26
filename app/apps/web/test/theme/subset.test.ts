// @vitest-environment node
import { readFileSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FONTS_DIR,
  JAPANESE_FONTS,
  REGENERATE,
  checkJapaneseFonts,
  japaneseText,
} from '../../scripts/ja-fonts.mjs';
import { describeWhen } from '../../src/when.js';

const read = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

/** Every character of the Japanese messages, comments left out. */
const messageCharacters = (): Set<string> =>
  new Set(
    ['../engine/locales/ja/engine.ftl', 'packages/client-core/locales/ja/ui.ftl']
      .flatMap((path) => read(path).split('\n'))
      .filter((line) => !line.startsWith('#'))
      .flatMap((line) => [...line.trim()]),
  );

const copies: string[] = [];

/** A copy of the committed subsets that a test may change. */
async function copyOfFonts(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wwd-ja-fonts-'));
  copies.push(dir);
  await cp(FONTS_DIR, dir, { recursive: true });
  return dir;
}

afterAll(async () => {
  for (const dir of copies) await rm(dir, { recursive: true, force: true });
});

describe('Japanese font subsets', () => {
  it("the subsets carry the fonts' licence and both copyright lines", async () => {
    const notice = await readFile(join(FONTS_DIR, 'OFL.txt'), 'utf8');
    expect(notice).toContain('The BIZ UDGothic Project Authors');
    expect(notice).toContain('The Shippori Mincho Project Authors');
    expect(notice).toContain('SIL OPEN FONT LICENSE Version 1.1');
    const dir = await copyOfFonts();
    await rm(join(dir, 'OFL.txt'));
    await expect(checkJapaneseFonts({ dir })).rejects.toThrow(/OFL.txt is missing/);
  });

  it('the subset covers every Japanese string', async () => {
    const text = japaneseText();
    const wanted = [...messageCharacters(), ...'日本語あアー、。「」（）！？：A~0'];
    expect(wanted.filter((c) => !text.includes(c))).toEqual([]);
    const faces = await checkJapaneseFonts({ text });
    expect(faces.map((face) => face.file)).toEqual(JAPANESE_FONTS.map((font) => font.file));
    // Only a face whose font stack names another face next may lack a character.
    expect(faces.filter((face) => face.fallback === undefined).map((face) => face.family)).toEqual([
      'BIZ UDPGothic',
      'BIZ UDPGothic',
    ]);
  });

  it('the subset covers the dates, times, numbers and lists the app formats in Japanese', async () => {
    const now = Date.UTC(2026, 10, 26, 9, 30);
    const seconds = [0, 1, 30, 59, 60, 5 * 60, 59 * 60, 3600, 3 * 3600, 23 * 3600];
    const days = [1, 2, 9, 30, 45, 100, 200, 300, 400, 800];
    const outputs = [
      ...seconds.map((s) => describeWhen(now - s * 1000, now, 'ja-JP')),
      ...days.map((d) => describeWhen(now - d * 86_400_000, now, 'ja-JP')),
      ...days.map((d) =>
        new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(now - d * 86_400_000),
      ),
      ...[0, 1, 2.5, 20.33, 1234.5].map((n) =>
        new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 }).format(n),
      ),
      new Intl.ListFormat('ja-JP', { type: 'conjunction' }).format(['狩人', '騎士', '占い師']),
    ];
    expect(outputs).toContain('11月25日');
    expect(outputs).toContain('30 秒前');
    expect(outputs.some((text) => /\d{4}年/.test(text))).toBe(true);
    await expect(checkJapaneseFonts({ text: outputs.join('') })).resolves.toBeDefined();
  });

  it('the check fails, saying how to regenerate, when a Japanese string uses a glyph the subsets lack', async () => {
    const failure = checkJapaneseFonts({ text: 'あ\u{1F43A}' });
    await expect(failure).rejects.toThrow(/U\+1F43A/);
    await expect(failure).rejects.toThrow(REGENERATE);
  });

  it('the check covers the formatter text recorded with the subsets, not what this Node prints', async () => {
    const manifest = JSON.parse(await readFile(join(FONTS_DIR, 'manifest.json'), 'utf8')) as {
      intl?: string;
    };
    expect(manifest.intl, 'the formatter text is recorded').toMatch(/秒/);
    expect(manifest.intl).toMatch(/月/);
    expect(japaneseText()).toBe(japaneseText({ intl: manifest.intl }));
    expect(japaneseText({ intl: '\u{1F43A}' })).toContain('\u{1F43A}');
    const dir = await copyOfFonts();
    const { intl: _, ...unrecorded } = manifest;
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(unrecorded));
    const failure = checkJapaneseFonts({ dir });
    await expect(failure).rejects.toThrow(/no recorded formatter text/);
    await expect(failure).rejects.toThrow(REGENERATE);
  });

  it('the check fails when a subset file is not the one its manifest describes', async () => {
    const dir = await copyOfFonts();
    const file = join(dir, JAPANESE_FONTS[0]!.file);
    const bytes = await readFile(file);
    bytes[bytes.length - 1] = bytes.at(-1)! ^ 1;
    await writeFile(file, bytes);
    await expect(checkJapaneseFonts({ dir })).rejects.toThrow(/does not match/);
  });
});
