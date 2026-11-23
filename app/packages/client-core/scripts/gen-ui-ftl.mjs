import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedDir = join(packageDir, 'src', 'generated');
const ftl = readFileSync(join(packageDir, 'locales/en/ui.ftl'), 'utf8');

mkdirSync(generatedDir, { recursive: true });
writeFileSync(
  join(generatedDir, 'ui-ftl.ts'),
  `export const uiFtl: Readonly<Record<string, string>> = { en: ${JSON.stringify(ftl)} };\n`,
);
