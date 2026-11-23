import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { beforeAll } from 'vitest';
import { initEngine } from '@wwd/engine';

// Under jsdom `import.meta.url` is not a file URL, so the module is found from the package root.
beforeAll(async () => {
  const require = createRequire(join(process.cwd(), 'package.json'));
  await initEngine(await readFile(require.resolve('@wwd/engine/wasm')));
});

// jsdom has no modal dialogs; this stands in for opening and closing one, without the inert backdrop.
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement): void {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement): void {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}
