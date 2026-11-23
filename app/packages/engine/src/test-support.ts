import { readFile } from 'node:fs/promises';
import { initEngine } from './index.js';

/** Loads the engine in Node by passing the module bytes directly. */
export async function loadEngineForNode(): Promise<void> {
  const bytes = await readFile(new URL('../dist/wasm/wwd_wasm_bg.wasm', import.meta.url));
  await initEngine(bytes);
}
