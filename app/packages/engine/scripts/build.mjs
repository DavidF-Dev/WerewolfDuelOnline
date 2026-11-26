import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engineDir = resolve(packageDir, '../../../engine');
const manifest = join(engineDir, 'Cargo.toml');
const distDir = join(packageDir, 'dist');
const generatedDir = join(packageDir, 'src', 'generated');

const run = (command, args, env = {}, cwd = packageDir) =>
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

function pinnedBindgenVersion() {
  const cargoToml = readFileSync(join(engineDir, 'crates/wwd-wasm/Cargo.toml'), 'utf8');
  const match = /^wasm-bindgen\s*=\s*"=([^"]+)"/m.exec(cargoToml);
  if (!match) throw new Error('wwd-wasm does not pin wasm-bindgen with "=".');
  return match[1];
}

function checkBindgenCli(expected) {
  let installed;
  try {
    installed = execFileSync('wasm-bindgen', ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    installed = null;
  }
  if (installed !== `wasm-bindgen ${expected}`) {
    throw new Error(
      `wasm-bindgen-cli ${expected} is required (found: ${installed ?? 'none'}). ` +
        `Install it with: cargo install wasm-bindgen-cli --version ${expected} --locked`,
    );
  }
}

checkBindgenCli(pinnedBindgenVersion());

rmSync(distDir, { recursive: true, force: true });
rmSync(generatedDir, { recursive: true, force: true });
mkdirSync(join(distDir, 'wasm'), { recursive: true });
mkdirSync(generatedDir, { recursive: true });

// Cargo runs from the engine directory so that its pinned toolchain applies.
run(
  'cargo',
  [
    'build',
    '--manifest-path',
    manifest,
    '-p',
    'wwd-wasm',
    '--target',
    'wasm32-unknown-unknown',
    '--release',
  ],
  {},
  engineDir,
);

const targetDir = process.env.CARGO_TARGET_DIR ?? join(engineDir, 'target');
run('wasm-bindgen', [
  '--target',
  'web',
  '--out-dir',
  join(distDir, 'wasm'),
  join(targetDir, 'wasm32-unknown-unknown/release/wwd_wasm.wasm'),
]);

run(
  'cargo',
  ['test', '--manifest-path', manifest, '-p', 'wwd-core', '--features', 'ts', 'export_bindings'],
  { TS_RS_EXPORT_DIR: generatedDir },
  engineDir,
);

const typeFiles = readdirSync(generatedDir)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .map((file) => file.slice(0, -3))
  .sort();
writeFileSync(
  join(generatedDir, 'index.ts'),
  typeFiles.map((name) => `export type { ${name} } from './${name}.js';\n`).join(''),
);

// Each language but English is a module of its own, so a bundler splits it from start-up code.
const localesDir = join(engineDir, 'locales');
const ftl = (locale) => readFileSync(join(localesDir, locale, 'engine.ftl'), 'utf8');
const others = readdirSync(localesDir)
  .sort()
  .filter((locale) => locale !== 'en');
for (const locale of others) {
  writeFileSync(
    join(generatedDir, `locale-${locale}.ts`),
    `const text: string = ${JSON.stringify(ftl(locale))};\nexport default text;\n`,
  );
}
const cases = others.flatMap((locale) => [
  `    case '${locale}':`,
  `      return (await import('./locale-${locale}.js')).default;`,
]);
writeFileSync(
  join(generatedDir, 'locales.ts'),
  [
    '/** The English engine text, by language. */',
    `export const engineFtl: Readonly<Record<string, string>> = ${JSON.stringify({ en: ftl('en') })};`,
    '',
    '/** The engine text of `locale`; a language other than English is loaded when first asked for. */',
    'export async function loadEngineFtl(locale: string): Promise<string> {',
    '  switch (locale) {',
    "    case 'en':",
    "      return engineFtl['en']!;",
    ...cases,
    '    default:',
    '      throw new Error(`no engine text for ${locale}`);',
    '  }',
    '}',
    '',
  ].join('\n'),
);

run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json']);
