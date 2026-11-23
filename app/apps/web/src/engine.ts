import wasmUrl from '@wwd/engine/wasm?url';
import { initEngine } from '@wwd/engine';

/** Loads the engine's WebAssembly module; safe to call again, as later calls share the first load. */
export const loadEngine = (): Promise<void> => initEngine(new URL(wasmUrl, location.href));
