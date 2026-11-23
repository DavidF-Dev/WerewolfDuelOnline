// The glue sits in the build output and is addressed from both `src` and `dist`.
import init, {
  WasmGame,
  engineVersion as wasmEngineVersion,
  eventId as wasmEventId,
  seedCommitment as wasmSeedCommitment,
  verifyReplay as wasmVerifyReplay,
  visibleTo as wasmVisibleTo,
} from '../dist/wasm/wwd_wasm.js';
import type {
  Command,
  Event,
  EventKind,
  Pending,
  Replay,
  RoundBoundary,
  RulesConfig,
  Seat,
  View,
  Viewer,
} from './generated/index.js';

export type * from './generated/index.js';
export { engineFtl } from './generated/locales.js';

/** An engine failure; `id` is the Fluent message ID. */
export class EngineError extends Error {
  constructor(readonly id: string) {
    super(id);
    this.name = 'EngineError';
  }
}

/** A failure inside the engine itself, such as a WebAssembly trap; the game must not be used afterwards. */
export class EngineFault extends Error {
  constructor(cause: unknown) {
    super('engine fault', { cause });
    this.name = 'EngineFault';
  }
}

function toEngineFailure(thrown: unknown): EngineError | EngineFault {
  if (thrown instanceof EngineError || thrown instanceof EngineFault) return thrown;
  if (typeof thrown === 'object' && thrown !== null && 'id' in thrown) {
    const { id } = thrown;
    if (typeof id === 'string') return new EngineError(id);
  }
  return new EngineFault(thrown);
}

function guard<T>(call: () => T): T {
  requireLoaded();
  try {
    return call();
  } catch (thrown) {
    throw toEngineFailure(thrown);
  }
}

let ready: Promise<void> | undefined;
let loaded = false;

/** Loads the WebAssembly module once; later calls share the first load, and a failure can be retried. */
export function initEngine(
  wasm?: BufferSource | URL | Response | WebAssembly.Module,
): Promise<void> {
  ready ??= init(wasm === undefined ? undefined : { module_or_path: wasm }).then(
    () => {
      loaded = true;
    },
    (thrown: unknown) => {
      ready = undefined;
      throw thrown;
    },
  );
  return ready;
}

function requireLoaded(): void {
  if (!loaded) throw new EngineError('error-engine-not-ready');
}

export function defaultRulesConfig(): RulesConfig {
  return { tiebreak: 'hourglasses_then_badge', min_targets: 1, badge_start: 'random' };
}

export class Game {
  private constructor(private inner: WasmGame | undefined) {}

  private live(): WasmGame {
    if (this.inner === undefined) throw new EngineError('error-game-disposed');
    return this.inner;
  }

  static create(seedHex: string, config: RulesConfig): Game {
    return new Game(guard(() => WasmGame.create(seedHex, config)));
  }

  static fromReplay(replay: Replay): Game {
    return new Game(guard(() => WasmGame.fromReplay(replay)));
  }

  apply(seat: Seat, cmd: Command): Event[] {
    return guard(() => this.live().apply(seat, cmd) as Event[]);
  }

  view(viewer: Viewer): View {
    return guard(() => this.live().view(viewer) as View);
  }

  eventsSince(from: number, viewer: Viewer): Array<[number, Event]> {
    return guard(() => this.live().eventsSince(from, viewer) as Array<[number, Event]>);
  }

  legalActions(seat: Seat): Command[] {
    return guard(() => this.live().legalActions(seat) as Command[]);
  }

  canResign(seat: Seat): boolean {
    return guard(() => this.live().canResign(seat));
  }

  pending(): Pending {
    return guard(() => this.live().pending() as Pending);
  }

  roundBoundary(): RoundBoundary | null {
    return guard(() => this.live().roundBoundary() as RoundBoundary | null);
  }

  replay(): Replay {
    return guard(() => this.live().replay() as Replay);
  }

  logLength(): number {
    return guard(() => this.live().logLength());
  }

  dispose(): void {
    this.inner?.free();
    this.inner = undefined;
  }
}

export function verifyReplay(replay: Replay): void {
  guard(() => wasmVerifyReplay(replay));
}

export function seedCommitment(seedHex: string): string {
  return guard(() => wasmSeedCommitment(seedHex));
}

export function eventId(kind: EventKind): string {
  return guard(() => wasmEventId(kind));
}

export function visibleTo(event: Event, viewer: Viewer): boolean {
  return guard(() => wasmVisibleTo(event, viewer));
}

export function engineVersion(): string {
  return guard(() => wasmEngineVersion());
}
