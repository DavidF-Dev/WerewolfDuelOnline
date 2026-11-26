import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedDir = join(packageDir, 'src', 'generated');
const localesDir = join(packageDir, 'locales');
const ftl = (locale) => readFileSync(join(localesDir, locale, 'ui.ftl'), 'utf8');
// Each language but English is a module of its own, so a bundler splits it from start-up code.
const others = readdirSync(localesDir)
  .sort()
  .filter((locale) => locale !== 'en');

mkdirSync(generatedDir, { recursive: true });
for (const locale of others) {
  writeFileSync(
    join(generatedDir, `ui-ftl-${locale}.ts`),
    `const text: string = ${JSON.stringify(ftl(locale))};\nexport default text;\n`,
  );
}
const cases = others.flatMap((locale) => [
  `    case '${locale}':`,
  `      return (await import('./ui-ftl-${locale}.js')).default;`,
]);
writeFileSync(
  join(generatedDir, 'ui-ftl.ts'),
  [
    '/** The English interface text, by language. */',
    `export const uiFtl: Readonly<Record<string, string>> = ${JSON.stringify({ en: ftl('en') })};`,
    '',
    '/** The interface text of `locale`; a language other than English is loaded when first asked for. */',
    'export async function loadUiFtl(locale: string): Promise<string> {',
    '  switch (locale) {',
    "    case 'en':",
    "      return uiFtl['en']!;",
    ...cases,
    '    default:',
    '      throw new Error(`no interface text for ${locale}`);',
    '  }',
    '}',
    '',
  ].join('\n'),
);
