// Regenerates the committed Japanese font subsets from source fonts installed into a temporary folder.
import { execSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  FONTS_DIR,
  JAPANESE_FONTS,
  LICENCE,
  MANIFEST,
  codePoint,
  japaneseText,
  missingCharacters,
  recordIntlText,
  sha256,
  sweptIntlText,
} from './ja-fonts.mjs';

/** The tools and fonts, each package of the tree at an exact version. */
const PACKAGES = {
  dependencies: {
    '@expo-google-fonts/biz-udpgothic': '0.4.2',
    '@expo-google-fonts/shippori-mincho-b1': '0.4.1',
    'subset-font': '2.9.0',
    harfbuzzjs: '1.6.4',
  },
  overrides: {
    harfbuzzjs: '1.6.4',
    fontverter: '2.0.0',
    wawoff2: '2.0.1',
    'woff2sfnt-sfnt2woff': '1.0.0',
    'p-limit': '3.1.0',
    'yocto-queue': '0.1.0',
    argparse: '2.0.1',
    pako: '1.0.11',
  },
};

/**
 * How the fonts are subset: the copyright, licence and name records are kept (name IDs 0 to 6,
 * 13 and 14), and the hinting is dropped, which makes the BIZ UDPGothic subsets about a fifth
 * smaller.
 */
const OPTIONS = { preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 13, 14], noHinting: true };

/** The OFL text for the subsets: every source font's copyright line, then the licence once. */
async function licence(work) {
  const packages = new Set(
    JAPANESE_FONTS.map((font) => font.source.split('/').slice(0, 2).join('/')),
  );
  const texts = await Promise.all(
    [...packages].map((name) => readFile(join(work, 'node_modules', name, 'LICENSE_FONT'), 'utf8')),
  );
  const start = 'This Font Software is licensed';
  const copyrights = texts.map((text) => text.slice(0, text.indexOf(start)).trim());
  const body = texts[0].slice(texts[0].indexOf(start)).trim();
  return `${copyrights.join('\n')}\n\n${body}\n`;
}

const work = await mkdtemp(join(tmpdir(), 'wwd-ja-fonts-'));
try {
  await writeFile(
    join(work, 'package.json'),
    JSON.stringify({ name: 'wwd-ja-fonts', private: true, ...PACKAGES }, null, 2),
  );
  console.log('Installing the source fonts and the subsetting tools…');
  execSync('npm install --ignore-scripts --no-audit --no-fund --loglevel=error', {
    cwd: work,
    stdio: 'inherit',
  });
  const require = createRequire(join(work, 'package.json'));
  const subsetFont = require('subset-font');
  const hb = await import(
    pathToFileURL(join(work, 'node_modules', 'harfbuzzjs', 'dist', 'index.mjs')).href
  );

  const text = japaneseText({ intl: sweptIntlText() });
  const faces = [];
  for (const font of JAPANESE_FONTS) {
    const source = await readFile(join(work, 'node_modules', font.source));
    const subset = await subsetFont(source, text, { ...OPTIONS, targetFormat: 'sfnt' });
    const face = new hb.Face(new hb.Blob(subset));
    const characters = [...face.collectUnicodes()].map((c) => String.fromCodePoint(c)).join('');
    face.destroy?.();
    const entry = { ...font, characters };
    const missing = missingCharacters(text, entry, faces);
    if (missing.length > 0) {
      throw new Error(
        `${font.family} ${font.weight} has no glyph for ${missing.map((c) => `${codePoint(c)} "${c}"`).join(', ')}`,
      );
    }
    const woff2 = await subsetFont(subset, text, { ...OPTIONS, targetFormat: 'woff2' });
    await writeFile(join(FONTS_DIR, font.file), woff2);
    faces.push({ ...entry, sha256: sha256(woff2) });
  }
  const manifest = {
    note: `Written by scripts/subset-ja-fonts.mjs; regenerate the subsets rather than editing it.`,
    fonts: faces.map(({ file, family, weight, fallback, sha256: hash, characters }) => ({
      file,
      family,
      weight,
      ...(fallback === undefined ? {} : { fallback }),
      sha256: hash,
      characters,
    })),
  };
  await writeFile(join(FONTS_DIR, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  await recordIntlText();
  await writeFile(join(FONTS_DIR, LICENCE), await licence(work));
  console.log(`Subset ${faces.length} Japanese fonts to ${[...text].length} characters.`);
} finally {
  await rm(work, { recursive: true, force: true });
}
