# M2 Local Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two browser tabs on one machine play a complete game against an in-browser referee. The engine runs as WASM, and every piece sits behind the interfaces that M3 will reuse for online play.

**Architecture:**
- **Engine:** the Rust engine (M1) gains TypeScript type export (ts-rs) and a WASM wrapper crate. It is consumed in `app/` as the workspace package `@wwd/engine`.
- **Referee and client:**
  - A pure TypeScript `referee-core` (`Room`) speaks the versioned JSON protocol from `@wwd/protocol`.
  - `referee-memory` hosts rooms in-process, and bridges other tabs over `BroadcastChannel`.
  - `client-core` (`GameClient`, transports, Fluent text) drives a minimal Svelte 5 page.
- **Data flow:** only `view()`, `events_since()` and replays ever leave the referee.

**Tech Stack:**
- Rust: wasm-bindgen (pinned), serde-wasm-bindgen, ts-rs.
- Node 24, pnpm 10, TypeScript 5 (strict).
- Libraries: Vitest, valibot, @fluent/bundle.
- UI: Svelte 5 + Vite (plain SPA, no SvelteKit); Playwright for end-to-end tests.

**Spec:** `/docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md`. The relevant sections:
- §6.1 layout;
- §6.4 protocol;
- §6.5 referee, including the notes for M2;
- §6.6 client;
- §8.5 accessibility;
- §10 testing.

**Scope:**
- **Not in M2:**
  - the Node and Cloudflare referee adapters, grace windows, claim-win, PIN rejoin, and the mobile lifecycle (all M3);
  - pause and save files, styling, PWA, history (M4);
  - DE/JA (M5).
- **Interfaces must allow these later without breaking changes:**
  - `Room` takes a `Clock`.
  - The protocol is versioned.
  - Snapshots serialise.

## Global Constraints

- **Repo layout:**
  - Single repo (this one). Engine work goes in `engine/`, app work in `app/`.
  - `app/` is the pnpm workspace root: `app/package.json`, `app/pnpm-workspace.yaml` (packages: `packages/*`, `apps/*`).
  - Package scope is `@wwd/*`.
- **Toolchain:**
  - Node 24, pnpm 10. If pnpm is missing: `npm install -g pnpm@10`.
  - TypeScript `strict: true`, plus `noUncheckedIndexedAccess: true`. ESM only (`"type": "module"`).
  - wasm-bindgen is pinned with `=` in `wwd-wasm/Cargo.toml`. Install the identical `wasm-bindgen-cli` version with `cargo install wasm-bindgen-cli --version <same> --locked`.
- **Verification:**
  - Engine: `cargo test --workspace --all-features`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo fmt --check`.
  - App: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint` (`tsc --noEmit` + `prettier --check`), and `pnpm --filter @wwd/web e2e` once it exists.
- **Git:** the user manages the repository. Never run git. Skip "Commit" steps and report the suggested message.
- **Conventions (from CLAUDE.md):**
  - British English in identifiers and comments.
  - User-facing strings in sentence case, all from Fluent `.ftl` files, with no literals in components.
  - Conservative comments, no file-path references, and comments must not depend on other code.
- **Hidden information:**
  - The referee never sends a `State`, a `Replay` (before game over) or `Omniscient` data.
  - Every `view`/`events` message to a connection is computed for *that connection's seat*.
  - The UI never decides rules: it only offers commands present in `legal`.
- **The engine is the authority.** No TypeScript code re-implements rules; it calls `@wwd/engine`.
- **Protocol constants:**

  | Constant | Value |
  |---|---|
  | `PROTOCOL_VERSION` | 1 |
  | `MAX_MESSAGE_BYTES` | 8192 |
  | Rate limit | 30 messages per rolling 10 000 ms per connection; excess → `error{code:"rate_limited"}` and the message is dropped |
  | Join code | 6 characters from the Crockford base32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, shown grouped `K7Q·2MX` |
  | Seat token | 32 lowercase hex characters (128 bits) |

- **Event sequence numbers are game-wide:** `seq = segment_base + log_index`. `segment_base` is 0 for the first segment. Later segments (M4) add the previous segments' log lengths.
- **No Cloudflare- or Node-specific APIs** in `referee-core`, `protocol` or `client-core`. Use only `Clock`/`Random` injected interfaces, plus `TextEncoder`/`TextDecoder` and `crypto.getRandomValues` (in adapters only).

## Review Focus

1. **Untrusted client input** must never throw out of `Room.handle` or change room state:
   - malformed JSON, wrong field types, an unknown `type`;
   - more than `MAX_MESSAGE_BYTES`;
   - a `command` before `hello`;
   - a `hello` with a wrong `protocol_version`.

   Each gets one `error{code}` reply. Test: `room rejects malformed and oversized input without state change` (Task 5).
2. **A third connection to a full room** without a valid token gets `error{code:"room_full"}` and no game data. A valid token for seat N takes over seat N (the newest connection wins, and the old connection gets `error{code:"superseded"}` and is detached). Test: `third connection cannot read a full room` and `token reconnect supersedes the old connection` (Task 5).
3. **`hello` with `last_seq`:**
   - `last_seq` beyond the current log, negative or non-integer → a full resync from 0, not a crash.
   - `last_seq` equal to the current length → an `events` message with an empty `events` array and the fresh `view`.

   Test: `resume with odd last_seq resyncs` (Task 5).
4. **Out-of-turn or post-game commands** return `error{code: <engine RuleError id>}`, e.g. `error-not-your-turn`, and leave the room snapshot unchanged. Test: `rule errors are relayed and leave the room unchanged` (Task 5).
5. **When the host tab closes or reloads,** the guest client must show status `disconnected`, not hang or show stale "your turn" actions. Test: `guest sees disconnected when host closes` (Task 7), driven by the host transport's `close`.

---

### Task 1: TypeScript type export and the WASM crate

**Files:**
- Modify: `engine/crates/wwd-core/Cargo.toml`. Add feature `ts = ["dep:ts-rs"]` and an optional dependency `ts-rs` (current version, with the `serde-compat` feature).
- Modify: the public types in `wwd-core/src/*.rs`. Add `#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]` to every type reachable from:
  - `View`, `Event`, `Command`, `Pending`, `Replay`, `RoundBoundary`;
  - `RulesConfig`, `RuleError`, `EditError`, `ReplayError`, `Viewer`.

  Fields using `with = "crate::hex"` get `#[cfg_attr(feature = "ts", ts(type = "string"))]`.
- Create: `engine/crates/wwd-wasm/Cargo.toml`:
  - `crate-type = ["cdylib", "rlib"]`;
  - dependencies: `wwd-core` (default features), `wasm-bindgen = "=<current>"`, `serde-wasm-bindgen`, `serde`;
  - `publish = false`, workspace metadata.
- Create: `engine/crates/wwd-wasm/src/lib.rs`.
- Test: `engine/crates/wwd-wasm/tests/api.rs` (native `rlib` tests of the pure inner functions).
- Test: `engine/crates/wwd-core/tests/ts_export.rs` (`#![cfg(feature = "ts")]`).

**Interfaces:**
- Consumes: the `wwd-core` public API (M1).
- Produces, in `wwd-wasm`. Each `#[wasm_bindgen]` method is a thin wrapper over a plain Rust function of the same name in a private `api` module that takes and returns serde types. That makes the logic natively testable.

  ```rust
  #[wasm_bindgen] pub struct WasmGame { recorder: Recorder }
  #[wasm_bindgen] impl WasmGame {
      #[wasm_bindgen(js_name = create)]      pub fn create(seed_hex: &str, config: JsValue) -> Result<WasmGame, JsValue>;
      #[wasm_bindgen(js_name = fromReplay)]  pub fn from_replay(replay: JsValue) -> Result<WasmGame, JsValue>;
      pub fn apply(&mut self, seat: JsValue, cmd: JsValue) -> Result<JsValue, JsValue>;      // Event[]
      pub fn view(&self, viewer: JsValue) -> Result<JsValue, JsValue>;                        // View
      #[wasm_bindgen(js_name = eventsSince)] pub fn events_since(&self, from: u32, viewer: JsValue) -> Result<JsValue, JsValue>; // [number, Event][]
      #[wasm_bindgen(js_name = legalActions)] pub fn legal_actions(&self, seat: JsValue) -> Result<JsValue, JsValue>;          // Command[]
      pub fn pending(&self) -> JsValue;                                                       // Pending
      #[wasm_bindgen(js_name = roundBoundary)] pub fn round_boundary(&self) -> JsValue;       // RoundBoundary | null
      pub fn replay(&self) -> JsValue;                                                        // Replay
      #[wasm_bindgen(js_name = logLength)] pub fn log_length(&self) -> u32;
  }
  #[wasm_bindgen(js_name = verifyReplay)]    pub fn verify_replay(replay: JsValue) -> Result<(), JsValue>;
  #[wasm_bindgen(js_name = seedCommitment)]  pub fn seed_commitment_hex(seed_hex: &str) -> Result<String, JsValue>;
  #[wasm_bindgen(js_name = eventId)]         pub fn event_id(kind: JsValue) -> Result<String, JsValue>;
  #[wasm_bindgen(js_name = visibleTo)]       pub fn visible_to(event: JsValue, viewer: JsValue) -> Result<bool, JsValue>;
  #[wasm_bindgen(js_name = engineVersion)]   pub fn engine_version() -> String;
  ```

- **Errors:** errors cross as a JS object `{ id: string }`, where `id` is the engine id, e.g. `error-not-your-turn` or `error-replay-…`. Malformed input that fails `serde-wasm-bindgen` deserialisation gives `{ id: "error-invalid-input" }`, which also needs a new message in `engine/locales/en/engine.ftl`.
- **Serialisation:** use `serde_wasm_bindgen::Serializer::json_compatible()`, so maps are plain objects and `u64`/`u128` are numbers. The `[u8;32]` fields already serialise as hex strings because the serializer is human-readable. A test asserts this.

- [ ] **Step 1: Write the failing tests**
  - `ts_export.rs::exports_all_public_types`: runs `export_all_to` into a temp directory and asserts these files exist and are non-empty: `View.ts`, `Event.ts`, `EventKind.ts`, `Command.ts`, `Pending.ts`, `Replay.ts`, `RulesConfig.ts`, `Seat.ts`, `Character.ts`, `TargetCard.ts`, `Phase.ts`, `RoundBoundary.ts`, `Viewer.ts`.
  - `ts_export.rs::hex_fields_are_strings`: `Segment.ts` contains `seed: string`, and `EventKind.ts` contains `seed_commitment: string`.
  - `api.rs::create_apply_view_roundtrip`:
    - `api::create("01…01" (64 hex), default)`, then `api::legal_actions(P0)` is non-empty;
    - applying the first one returns events;
    - `api::view(Seat(P1))` has `players[0].hand == None`.
  - `api::events_since(0, Seat(P1))` contains no `HandDealt` for P0.
  - `api.rs::errors_carry_engine_ids`:
    - applying `NextRound` in the Plan phase gives `Err(id == "error-wrong-phase")`;
    - `api::create("zz", …)` gives `Err(id == "error-invalid-input")`.
  - `api.rs::from_replay_verifies`: a tampered replay gives `Err(id)` starting with `error-replay-`.
- [ ] **Step 2: Run the tests and confirm they fail.** Run `cargo test -p wwd-core --features ts --test ts_export` and `cargo test -p wwd-wasm`. Expected: FAIL (missing).
- [ ] **Step 3: Implement.** Implement the derives, the `api` module and the `#[wasm_bindgen]` wrappers. Add `wwd-wasm` to CI: the existing `engine.yml` builds the workspace for `wasm32-unknown-unknown` (`cargo build -p wwd-wasm --target wasm32-unknown-unknown --release`).
- [ ] **Step 4: Run the tests and the WASM build.** Run both test commands, then `cargo build -p wwd-wasm --target wasm32-unknown-unknown --release`. Expected: PASS and a successful build. Run the engine verification commands.
- [ ] **Step 5: Commit.** `feat(engine): ts-rs type export and wwd-wasm bindings`.

---

### Task 2: App workspace and the `@wwd/engine` package

**Files:**
- Create the workspace root:
  - `app/package.json` (private, `"packageManager": "pnpm@10.x"`, scripts `build`, `test`, `lint` → `pnpm -r …`);
  - `app/pnpm-workspace.yaml`;
  - `app/tsconfig.base.json`;
  - `app/.prettierrc` (printWidth 100, singleQuote).
- Create the `@wwd/engine` package:
  - `app/packages/engine/package.json` (name `@wwd/engine`, `exports` → `./dist/index.js` + types);
  - `app/packages/engine/scripts/build.mjs`;
  - `app/packages/engine/src/index.ts`;
  - `app/packages/engine/tsconfig.json`.
- Test: `app/packages/engine/test/engine.test.ts` (Vitest, Node environment).
- Create: `/.github/workflows/app.yml`:
  - triggers on `paths: ["app/**", "engine/**", ".github/workflows/app.yml"]`, with `permissions: contents: read`;
  - installs Rust stable, the wasm target and `wasm-bindgen-cli` (cached), then Node 24 and pnpm;
  - runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lint`, `pnpm test`.

**Interfaces:**
- Consumes: the `wwd-wasm` exports and ts-rs bindings (Task 1).
- `scripts/build.mjs`, run from `app/packages/engine` via `pnpm build`:
  1. `cargo build -p wwd-wasm --target wasm32-unknown-unknown --release`, with `--manifest-path ../../../engine/Cargo.toml`;
  2. `wasm-bindgen --target web --out-dir dist/wasm <target>/wwd_wasm.wasm`;
  3. `cargo test -p wwd-core --features ts --test ts_export` with `TS_RS_EXPORT_DIR=<abs>/src/generated` (generated, git-ignored);
  4. write `dist/locales.js` exporting `export const engineFtl = { en: <contents of engine/locales/en/engine.ftl> }`;
  5. `tsc -p tsconfig.json`.

  Add `app/packages/engine/src/generated/` to the root `.gitignore`.
- Produces `@wwd/engine` (`src/index.ts`):
  ```ts
  export * from './generated/index'; // re-exports every ts-rs type (write an index.ts barrel in the build step)
  export class EngineError extends Error { constructor(readonly id: string) }
  export function initEngine(wasm?: BufferSource | URL | Response): Promise<void>; // idempotent; Node passes bytes
  export class Game {
    static create(seedHex: string, config: RulesConfig): Game;
    static fromReplay(replay: Replay): Game;
    apply(seat: Seat, cmd: Command): Event[];
    view(viewer: Viewer): View;
    eventsSince(from: number, viewer: Viewer): Array<[number, Event]>;
    legalActions(seat: Seat): Command[];
    pending(): Pending;
    roundBoundary(): RoundBoundary | null;
    replay(): Replay;
    logLength(): number;
    dispose(): void;
  }
  export function verifyReplay(replay: Replay): void;
  export function seedCommitment(seedHex: string): string;
  export function eventId(kind: EventKind): string;
  export function visibleTo(event: Event, viewer: Viewer): boolean;
  export function engineVersion(): string;
  export { engineFtl } from './locales'; // typed declaration for dist/locales.js
  ```
  Every method converts a thrown `{id}` into `EngineError`.
- **Test helper:** `test/load.ts` exports `loadEngineForNode()`. It reads `dist/wasm/wwd_wasm_bg.wasm` with `fs` and calls `initEngine(bytes)`. Later packages' tests import it via `@wwd/engine/test-support`. Add that `exports` entry, pointing to the compiled helper.

- [ ] **Step 1: Write the failing test** `engine.test.ts`:
  - `plays a scripted round`:
    - `Game.create('01'.repeat(32), defaultConfig)`;
    - apply `legalActions(p)[0]` for each pending seat until `view.phase` is `round_over` or `game_over`;
    - assert `view({seat:'p1'}).players[0].hand === null`.
  - `errors are EngineError with ids`: `NextRound` during plan → `EngineError` with `id === 'error-wrong-phase'`.
  - `replay verifies and tampering fails`:
    - `verifyReplay(game.replay())` doesn't throw;
    - changing `segments[0].seed` throws an `EngineError` whose id starts `error-replay-`.
  - `hex fields are strings`: `typeof game.replay().segments[0].seed === 'string'` and its length is 64.
  - `engineFtl.en contains character-wolf-king`.
- [ ] **Step 2: Run it.** `pnpm install && pnpm --filter @wwd/engine build && pnpm --filter @wwd/engine test`. Expected: FAIL.
- [ ] **Step 3: Implement** the workspace, the build script, the wrapper and CI.
- [ ] **Step 4: Run it again.** Same command. Expected: PASS. Then run `pnpm lint`.
- [ ] **Step 5: Commit.** `feat(app): pnpm workspace and @wwd/engine package`.

---

### Task 3: `@wwd/protocol`

**Files:**
- Create: `app/packages/protocol/{package.json,tsconfig.json,src/index.ts,src/messages.ts,src/codes.ts}`
- Test: `app/packages/protocol/test/protocol.test.ts`

**Interfaces:**
- Consumes: `@wwd/engine` types only (`Seat`, `Command`, `Event`, `View`, `Pending`, `RulesConfig`, `Replay`).
- Produces:
  ```ts
  export const PROTOCOL_VERSION = 1;
  export const MAX_MESSAGE_BYTES = 8192;
  export type ClientMessage =
    | { type: 'hello'; protocol_version: number; room: string; seat_token?: string; last_seq?: number; name?: string }
    | { type: 'command'; cmd: Command }
    | { type: 'ping' };
  export type ServerMessage =
    | { type: 'welcome'; seat: Seat; seat_token: string; room: string; config: RulesConfig }
    | { type: 'waiting' }                                   // seat claimed, opponent not yet joined
    | { type: 'events'; from_seq: number; events: Array<[number, Event]>; view: View; legal: Command[]; pending: Pending }
    | { type: 'opponent_status'; connected: boolean; name?: string }
    | { type: 'game_over'; replay: Replay }
    | { type: 'error'; code: ErrorCode }
    | { type: 'pong' };
  export type ErrorCode = 'invalid_message' | 'too_large' | 'protocol_version' | 'not_joined' | 'room_full' | 'unknown_room'
    | 'superseded' | 'rate_limited' | `error-${string}`;     // engine ids pass through
  export function parseClientMessage(raw: string): { ok: true; msg: ClientMessage } | { ok: false; code: ErrorCode };
  export function parseServerMessage(raw: string): { ok: true; msg: ServerMessage } | { ok: false; code: ErrorCode };
  export function encode(msg: ClientMessage | ServerMessage): string; // JSON.stringify
  ```
- **Validation:**
  - Use valibot for structure: field presence and types, `room` matching `/^[0-9A-HJKMNP-TV-Z]{6}$/`, `seat_token` matching `/^[0-9a-f]{32}$/`, `name` of 1–24 characters after trimming, and `last_seq` as a non-negative integer.
  - `cmd` is checked structurally only (an object with a known variant key, or `"next_round"`). The engine does full validation.
  - Byte-size checking uses `new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES` and gives `too_large`.

- [ ] **Step 1: Write failing tests:**
  - `parses each client message`;
  - `rejects unknown type`;
  - `rejects bad room code` (`'k7q2mx'`, `'K7Q2M'`, `'K7Q2MI'`);
  - `rejects oversized` (9000 bytes);
  - `rejects negative or fractional last_seq`;
  - `encode then parse round-trips every server message`;
  - `command accepts every engine Command shape`: build one of each variant, including `"next_round"`.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/protocol test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS. Then run `pnpm lint`.
- [ ] **Step 5: Commit.** `feat(app): wire protocol package`.

---

### Task 4: `referee-core` room lifecycle

**Files:**
- Create: `app/packages/referee-core/{package.json,tsconfig.json,src/index.ts,src/room.ts,src/deps.ts,src/codes.ts,src/snapshot.ts}`
- Test: `app/packages/referee-core/test/room.test.ts`, plus `test/harness.ts`. The harness holds a fake `Clock`, a seeded fake `Random`, and helpers that run a full game through `Room` by choosing `legal[0]`.

**Interfaces:**
- Consumes: `@wwd/engine` (`Game`, `seedCommitment`, `visibleTo`) and `@wwd/protocol`.
- Produces:
  ```ts
  export interface Clock { now(): number }                       // ms
  export interface Random { bytes(n: number): Uint8Array }
  export type ConnId = string;
  export interface Outbound { conn: ConnId; msg: ServerMessage }
  export function generateJoinCode(random: Random): string;     // 6 Crockford chars, rejection-sampled
  export class Room {
    static create(code: string, config: RulesConfig, deps: { clock: Clock; random: Random }): Room;
    static restore(snapshot: RoomSnapshot, deps: { clock: Clock; random: Random }): Room;
    get code(): string;
    handle(conn: ConnId, raw: string): Outbound[];   // never throws
    disconnect(conn: ConnId): Outbound[];            // never throws
    snapshot(): RoomSnapshot;
  }
  export interface RoomSnapshot {
    version: 1; code: string; config: RulesConfig;
    seats: [SeatRecord | null, SeatRecord | null];  // SeatRecord { token: string; name?: string }
    replay: Replay | null;                           // null until both seats joined
    segment_base: number;                            // 0 in M2
  }
  ```
- **Behaviour** (spec §6.4–6.5; the M2 subset):
  - **`hello` without a token:** claims the lowest free seat (P0 first). It replies `welcome{seat, seat_token, room, config}` with a fresh token from `Random` (16 bytes → hex). Then:
    - if the opponent is missing, it sends `waiting`;
    - if both seats are now claimed, it creates the game with `Game.create(hex(random.bytes(32)), config)`, then sends each connected seat its own `events` from 0 and `opponent_status{connected:true, name}`.
  - **`hello` with a valid token:**
    - It re-binds that seat to this connection.
    - A previously bound connection gets `error{code:'superseded'}` and is unbound.
    - It replies `welcome` (same token), then `events` from `last_seq` (Review Focus 3), and tells the opponent `opponent_status{connected:true}`.
  - **`hello` with an unknown token on a full room:** `room_full`. A wrong `room`: `unknown_room`. A wrong version: `protocol_version`.
  - **`command`** from a bound connection:
    - Call `game.apply(seat, cmd)`.
    - On `EngineError`: reply `error{code: e.id}` to the sender only.
    - On success: send **each** bound seat `events{from_seq: its previous high-water mark, events: game.eventsSince(mark, {seat}), view: game.view({seat}), legal: game.legalActions(seat), pending: game.pending()}`, then advance that seat's mark to `game.logLength()`.
    - All seq values are offset by `segment_base`.
    - When the phase becomes `game_over`, send each seat `game_over{replay: game.replay()}` after the `events`.
  - **`ping`:** `pong`.
  - **`disconnect`:** unbind, and send the opponent `opponent_status{connected:false}`.
  - **Rate limit and size:** as in Global Constraints. The rate limit is tracked per connection with `clock.now()`.
- **Round trip:** `snapshot()` and `restore()` round-trip exactly. The game is rebuilt with `Game.fromReplay` (which verifies); a failed verification throws from `restore`, since that's trusted-host input. Per-seat high-water marks aren't stored: after a restore, clients resync by `last_seq` on reconnect.

- [ ] **Step 1: Write failing tests** (`room.test.ts`):
  - `first hello gets seat p0 and waiting`.
  - `second hello starts the game and both get their own view`. P0's `events` view has `viewer {seat:'p0'}`, and P1's has `players[0].hand === null`.
  - `full game through the room`: the harness plays to `game_over`, and both seats receive a `game_over` whose replay passes `verifyReplay`.
  - `every outbound event is visible to its recipient`: across a full game, for every `events` message to seat s, each event satisfies `visibleTo(ev, {seat: s})`, and `view.viewer` equals `{seat: s}`.
  - `snapshot and restore continue the game`: snapshot mid-round 2, restore, reconnect both with tokens (`last_seq: 0`), continue to `game_over`, and the final replay verifies.
  - `join code alphabet and length`: 1000 codes from the fake `Random` all match `/^[0-9A-HJKMNP-TV-Z]{6}$/`.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/referee-core test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(app): referee-core room lifecycle`.

---

### Task 5: `referee-core` hardening (Review Focus 1–4)

**Files:**
- Modify: `app/packages/referee-core/src/room.ts`
- Test: `app/packages/referee-core/test/hardening.test.ts`

**Interfaces:**
- Consumes: Task 4's `Room` and the harness.
- Produces: no new API. These are behaviour guarantees.

- [ ] **Step 1: Write failing tests:**
  - `room rejects malformed and oversized input without state change`. For each of `'{'`, `'null'`, `'{"type":"warp"}'`, `'{"type":"hello","protocol_version":"1"}'`, a 9000-byte string, and `command` before `hello`:
    - the reply is exactly one `error` with the expected code (`invalid_message`, `too_large`, `not_joined`);
    - `JSON.stringify(room.snapshot())` is unchanged.
  - `wrong protocol version is rejected`.
  - `third connection cannot read a full room`. A third `hello` without a token gets only `error{room_full}`. Its connection id never appears as a recipient of any later outbound message.
  - `token reconnect supersedes the old connection`. The old connection gets `error{superseded}`, then receives nothing more. The new connection gets `welcome` + `events`.
  - `resume with odd last_seq resyncs`. `last_seq` of 10⁹ gives `from_seq` 0 with all of the seat's visible events. `last_seq` equal to the length gives an empty `events` array and a current `view`.
  - `rule errors are relayed and leave the room unchanged`. An out-of-turn command gets `error{code:'error-not-your-turn'}` to the sender only, and the snapshot is unchanged. After game over, any command gets `error-game-over`.
  - `rate limit`: 31 pings within 10 s → the 31st gets `rate_limited`. After advancing the fake clock by 10 s, pings succeed again.
  - `handle never throws`: 500 random byte strings and random JSON values. No exception, and every reply is an `error`.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/referee-core test`. Expected: the new tests FAIL where Task 4 didn't already cover the behaviour. Note any that pass immediately.
- [ ] **Step 3: Implement** the missing guards.
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(app): referee-core input hardening`.

---

### Task 6: Transports and `referee-memory`

**Files:**
- Create in `client-core`, the transport half:
  - `app/packages/client-core/{package.json,tsconfig.json}`
  - `app/packages/client-core/src/transport.ts`
  - `app/packages/client-core/src/broadcast-transport.ts`
- Create `referee-memory`:
  - `app/packages/referee-memory/{package.json,tsconfig.json,src/index.ts,src/memory-referee.ts,src/broadcast-host.ts}`
- Test: `app/packages/referee-memory/test/memory.test.ts`. It uses Node's global `BroadcastChannel`, available in Node 24.

**Interfaces:**
- Consumes: `Room` (Tasks 4–5) and `generateJoinCode`.
- Produces in `@wwd/client-core`:
  ```ts
  export interface Transport {
    send(text: string): void;
    onMessage(cb: (text: string) => void): () => void;   // returns unsubscribe
    onClose(cb: () => void): () => void;
    close(): void;
    readonly open: boolean;
  }
  export function createInMemoryPair(): [Transport, Transport];   // delivery is async (queueMicrotask) to mimic networks
  export class BroadcastChannelTransport implements Transport {   // guest side
    constructor(channelName: string, connId?: string);              // connId default: random hex
  }
  ```
- Produces in `@wwd/referee-memory`:
  ```ts
  export class MemoryReferee {
    constructor(deps?: { clock?: Clock; random?: Random });         // defaults: Date.now, crypto.getRandomValues
    createRoom(config: RulesConfig): string;                         // join code
    accept(transport: Transport): void;                              // server end of a connection; routes by hello.room
    close(): void;                                                   // closes every connection
  }
  export class BroadcastChannelHost {
    constructor(referee: MemoryReferee, channelName: string);
    close(): void;
  }
  ```
- **BroadcastChannel envelope:** every channel message is `{ conn: string; dir: 'c2s' | 's2c' | 'close'; text?: string }`.
  - Guests only post `c2s` and `close`, and only read `s2c` messages addressed to their own `conn`.
  - The host relays each `conn` to its own `Room` connection.
  - When the host closes, it posts `{dir:'close'}` for every known connection. A guest receiving `close` for its `conn` fires `onClose`.
  - The channel name is `wwd-local`.
  - Document in the class `///` doc that any tab on the same origin can read the channel. Local mode is single-user by design.

- [ ] **Step 1: Write failing tests:**
  - `two in-memory clients play a full game`: create a room, connect two pairs, send `hello`s, and drive `legal[0]` to `game_over`.
  - `broadcast guest joins host room`: the host is `MemoryReferee` + `BroadcastChannelHost`; the guest is a `BroadcastChannelTransport`. The guest's `hello` gets a `welcome` with seat `p1`.
  - `guest only receives its own messages`: two guest transports with different `conn`s on the same channel. One joins as P1, the other is rejected (`room_full`). The rejected one never receives `events`.
  - `host close notifies guests`: `host.close()` → the guest's `onClose` fires.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/referee-memory test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(app): transports and in-memory referee with BroadcastChannel host`.

---

### Task 7: `client-core` GameClient and Fluent text

**Files:**
- Create:
  - `app/packages/client-core/src/game-client.ts`
  - `app/packages/client-core/src/store.ts`
  - `app/packages/client-core/src/i18n.ts`
  - `app/packages/client-core/src/render-event.ts`
  - `app/packages/client-core/locales/en/ui.ftl`
- Modify: `app/packages/client-core/src/index.ts`
- Test: `app/packages/client-core/test/game-client.test.ts` and `test/i18n.test.ts`

**Interfaces:**
- Consumes: `Transport`, the protocol, and `@wwd/engine` (`verifyReplay`, `seedCommitment`, `eventId`, `engineFtl`, types).
- Produces:
  ```ts
  export interface Readable<T> { subscribe(run: (value: T) => void): () => void }   // Svelte store contract
  export type ClientStatus = 'connecting' | 'waiting' | 'playing' | 'game_over' | 'disconnected' | 'rejected';
  export interface GameClientState {
    status: ClientStatus; room: string; seat: Seat | null; seatToken: string | null;
    opponent: { connected: boolean; name?: string };
    view: View | null; legal: Command[]; pending: Pending | null;
    events: Array<[number, Event]>; lastSeq: number;            // lastSeq = highest seq received + 1
    replay: Replay | null; replayVerified: boolean | null;       // set at game_over
    lastError: string | null;                                     // protocol code or engine id
  }
  export class GameClient {
    constructor(opts: { room: string; name?: string; seatToken?: string });
    readonly state: Readable<GameClientState>;
    get current(): GameClientState;
    attach(transport: Transport): void;     // sends hello (with seatToken/lastSeq if known); re-callable to reconnect
    command(cmd: Command): void;            // throws if cmd is not deep-equal to an entry of current.legal
    dispose(): void;
  }
  export function createLocaliser(locale: 'en'): {
    t(id: string, args?: Record<string, string | number>): string;
    renderEvent(event: Event, perspective: Seat | null): string;
  };
  ```
- **Game-over verification:** `replayVerified` is true only if `verifyReplay(replay)` passes **and** `seedCommitment(replay.segments[0].seed)` equals the `seed_commitment` in the `game_started` event this client received. A mismatch sets `false` and `lastError = 'commitment_mismatch'`.
- **Event text:**
  - `renderEvent` uses `eventId(event.kind)` as the message id.
  - Its Fluent arguments match those used by the CLI renderer (read `engine/crates/wwd-cli/src/render.rs` and mirror its argument names and the character/seat display logic).
  - Seats render as "You" or "Opponent" from `perspective`, via new `ui.ftl` messages `seat-you`/`seat-opponent`.
- **Closing:** when the transport closes, status becomes `disconnected` and `legal` becomes `[]`.

- [ ] **Step 1: Write failing tests:**
  - `plays a full game and verifies the replay`: two clients over `MemoryReferee` drive `legal[0]` from their own state until both reach `game_over`. Assert both have `replayVerified === true`.
  - `rejects a forged commitment`: feed a client a `game_over` whose replay's seed has a different commitment. Assert `replayVerified === false`.
  - `command not in legal throws`.
  - `reconnect resumes from lastSeq`: mid-game, close the guest transport, then `attach` a new pair. The client sends `last_seq`, receives only newer events, and its `events` list has no duplicate seq.
  - `guest sees disconnected when host closes` (Review Focus 5).
  - `i18n.test.ts::every event kind renders without missing messages`. Produce events from a fuzz-like full game, render each from both perspectives, and assert no output contains an unresolved `{` or a raw id.
  - `i18n.test.ts::ui strings are sentence case`: every `ui.ftl` value starts with an uppercase letter, and no other word is capitalised unless it's listed in an allow-list of game terms (Cross, Fang, Hourglass, Potion, Badge, Fool, and the character names).
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/client-core test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat(app): GameClient, local transports and Fluent rendering`.

---

### Task 8: The unstyled web table (`apps/web`)

**Files:**
- Create:
  - `app/apps/web/{package.json,vite.config.ts,tsconfig.json,index.html}`
  - `app/apps/web/src/{main.ts,App.svelte,router.ts,session.ts}`
  - `app/apps/web/src/screens/{Home.svelte,Host.svelte,Join.svelte,Table.svelte}`
  - `app/apps/web/src/components/{OpponentStrip.svelte,MyArea.svelte,PlanBuilder.svelte,PhaseActions.svelte,EventLog.svelte}`
  - `app/apps/web/src/dev-hook.ts`
- Modify: `app/packages/client-core/locales/en/ui.ftl` (screen strings)
- Test: `app/apps/web/test/{PlanBuilder.test.ts,PhaseActions.test.ts,Table.test.ts}` (Vitest + @testing-library/svelte, jsdom)

**Interfaces:**
- Consumes: `GameClient`, `createLocaliser`, `MemoryReferee`, `BroadcastChannelHost`, `BroadcastChannelTransport`, `createInMemoryPair` and `initEngine`.
- **Routes** (hash router, no library):
  - `#/` → Home: "Host a local game" and "Join a local game" buttons, plus the footer from spec §8.1 ("Made by David F Dev", the unofficial and not-affiliated notices, and the "Get the physical game ↗" BoardGameGeek link with `target="_blank" rel="noopener noreferrer"`). All of its text comes from `ui.ftl`.
  - `#/host` → Host. It creates a `MemoryReferee` + `BroadcastChannelHost`, and joins its own seat via an in-memory pair. It shows the join code grouped as `ABC·DEF` and a "Waiting for opponent" status, then switches to the Table.
  - `#/join` → Join: a code input (case-insensitive, `·` and spaces ignored). It connects via `BroadcastChannelTransport`.
- **Session persistence:** `session.ts` stores `{room, seatToken, lastSeq}` per tab in `sessionStorage`. Every access is wrapped in try/catch. A guest reload reattaches with its token.
- **`Table.svelte`** is a pure function of `client.state` and contains:
  - `OpponentStrip`: name, connection status, markers, hand size, plan status from `PlanView`.
  - `MyArea`: hand and markers.
  - `PhaseActions`: buttons built **only** from `legal`.
  - `PlanBuilder`: shown in the plan phase.
  - `EventLog`: an `aria-live="polite"` list of `renderEvent` texts.
- **`PlanBuilder`:**
  - The player picks a character, then toggles target cards.
  - "Seal plan" is enabled only when the exact `{character, targets(sorted)}` matches an entry in `legal`.
  - Target toggles not present in any legal plan for the chosen character are `disabled`.
- **Semantics:**
  - Every card and action is a `<button>` with an accessible name from Fluent (e.g. "Knight, initiative 3, Human"), plus `data-testid`.
  - Regions use `<section aria-labelledby>`, and lists use `<ul>`.
  - No colour-only information. Minimal CSS only (layout, focus outline).
- **`dev-hook.ts`:**
  - When `import.meta.env.DEV`, it sets `window.__wwd = { state: () => client.current, legal: () => client.current.legal, act: (cmd) => client.command(cmd), describe: () => <text summary> }`.
  - It's excluded from production builds by the `DEV` check.
  - `describe()` returns lines built from `renderEvent` and the current view: round, phase, my hand, markers and pending.

- [ ] **Step 1: Write failing component tests:**
  - `PlanBuilder seals only legal plans`:
    - given a fixture `legal` list for hand `[knight, seer, villager]`;
    - choosing Knight disables human targets;
    - choosing Wolfen enables "Seal plan", and clicking it emits that exact command;
    - choosing Villager with nothing selected keeps it disabled; adding the Fool enables it.
  - `PhaseActions renders one button per legal command`: hourglasses `0..2`, potion targets, hunter yes/no and next round, each with a Fluent label.
  - `Table hides opponent hand`: a fixture view for p1 renders the opponent's hand size but no card buttons in the opponent region.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/web test`. Expected: FAIL.
- [ ] **Step 3: Implement.** Check manually with `pnpm --filter @wwd/web dev`: two tabs, host and join, one round played by hand.
- [ ] **Step 4: Run them again.** Run `pnpm --filter @wwd/web test` and `pnpm --filter @wwd/web build`. Expected: PASS, and the build succeeds.
- [ ] **Step 5: Commit.** `feat(web): unstyled local two-tab table`.

---

### Task 9: End-to-end two-tab game, docs and spec sync

**Files:**
- Create: `app/apps/web/playwright.config.ts` (projects: chromium desktop, chromium `Pixel 7` emulation; `webServer: pnpm dev`)
- Create: `app/apps/web/e2e/local-game.spec.ts`
- Modify: `/.github/workflows/app.yml` (install Playwright chromium, run `pnpm --filter @wwd/web e2e`)
- Modify: `/CLAUDE.md` (status line, plus a "Commands" section for engine and app build/test)
- Modify: `/docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md`:
  - §6.1: there is no `wwd-protocol` crate. The protocol is the TypeScript `@wwd/protocol`, the engine package is `app/packages/engine`, and the web app is a plain Vite SPA, not SvelteKit.
  - §6.4: drop `state_hash`; add the `waiting` message and the error codes; add the global seq rule.
  - §6.6: add the BroadcastChannel local mode.

**Interfaces:**
- Consumes: the web app (Task 8), including `window.__wwd`.

- [ ] **Step 1: Write the failing e2e tests** in `local-game.spec.ts`. Both pages are in the **same browser context** (BroadcastChannel requires that).
  - `two tabs play a full game`:
    - the host page goes to `#/host` and reads the code from the `join-code` test id;
    - the guest page goes to `#/join`, fills in the code and submits;
    - loop: for each page, if `__wwd.legal()` is non-empty, click the first enabled button in the `Actions` region, or for a plan use PlanBuilder by clicking through `legal()[0]`;
    - stop when both show the "Game over" heading;
    - assert both `__wwd.state().replayVerified === true`.
  - `guest never receives the host hand`: at every loop step, `guest.__wwd.state().view.players[hostSeat].hand === null`.
  - `guest reload resumes`: reload the guest mid-game. It returns to the table with the same seat, and play continues to game over.
  - `keyboard only`: the guest seals a plan using Tab/Enter only.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/web e2e`. Expected: FAIL (no config).
- [ ] **Step 3: Implement** the config, any test ids the e2e needs, and the CI and docs changes.
- [ ] **Step 4: Run everything:**
  - `pnpm --filter @wwd/web e2e` → PASS on both projects.
  - `pnpm build && pnpm lint && pnpm test` → PASS.
  - The engine verification commands → PASS.
- [ ] **Step 5: Commit.** `test(web): two-tab end-to-end game; docs and spec sync for M2`.
