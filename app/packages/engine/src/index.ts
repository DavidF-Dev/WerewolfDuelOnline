// The glue sits in the build output and is addressed from both `src` and `dist`.
import init, {
  WasmGame,
  abilitySummary as wasmAbilitySummary,
  contentHash as wasmContentHash,
  effectiveInitiative as wasmEffectiveInitiative,
  engineVersion as wasmEngineVersion,
  eventId as wasmEventId,
  replayTimeline as wasmReplayTimeline,
  seedCommitment as wasmSeedCommitment,
  showdownOrder as wasmShowdownOrder,
  validatePlan as wasmValidatePlan,
  verifyReplay as wasmVerifyReplay,
  visibleTo as wasmVisibleTo,
} from '../dist/wasm/wwd_wasm.js';
import type {
  AbilitySummary,
  Character,
  Command,
  Event,
  EventKind,
  Pending,
  Plan,
  Replay,
  RoundBoundary,
  RulesConfig,
  Seat,
  TimelineStep,
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

  /** Continues `prior` from its round boundary in a new segment dealt from `seedHex`. */
  static resume(boundary: RoundBoundary, prior: Replay, seedHex: string): Game {
    return new Game(guard(() => WasmGame.resume(boundary, prior, seedHex)));
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

/** The Fluent ID of the first rule the plan breaks, or `null` if the rules allow it. */
export function validatePlan(plan: Plan, config: RulesConfig): string | null {
  return guard(() => wasmValidatePlan(plan, config) ?? null);
}

export function effectiveInitiative(character: Character, placed: number): number {
  return guard(() => wasmEffectiveInitiative(character, placed));
}

/** What `character` gains, spends and attacks when it resolves, for drawing its ability. */
export function abilitySummary(character: Character): AbilitySummary {
  return guard(() => wasmAbilitySummary(character) as AbilitySummary);
}

/** The seats in showdown order, from the reveal until the next round is dealt. */
export function showdownOrder(view: View): [Seat, Seat] | null {
  return guard(() => wasmShowdownOrder(view) as [Seat, Seat] | null);
}

/** Every step of a verified replay as `viewer` may see it. */
export function replayTimeline(replay: Replay, viewer: Viewer): TimelineStep[] {
  return guard(() => wasmReplayTimeline(replay, viewer) as TimelineStep[]);
}

/** The BLAKE3 hash of the text's UTF-8 bytes, in lowercase hexadecimal. */
export function contentHash(text: string): string {
  return guard(() => wasmContentHash(text));
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
