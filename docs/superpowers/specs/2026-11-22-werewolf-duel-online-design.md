# Werewolf: Duel! Online — Design

*Status: draft for approval · 2026-11-22*
*Background research and sources: [`docs/research/2026-11-21-research-and-recommendations.md`](../../research/2026-11-21-research-and-recommendations.md).*
*Mockups: [`docs/mockups/mockups.html`](../../mockups/mockups.html).*

---

## 1. Intent

*Werewolf: Duel!* (Whales Entertainment) is a 20-minute, two-player bluffing card game. This project builds **"Werewolf: Duel! Online — An unofficial digital version of Werewolf: Duel!"** so that two friends can play over the Internet in a browser, on desktop or phone.

It is a hobby project with zero running cost by default. It is designed so that it can later grow into public matchmaking, self-hosting, a paid server, LAN play, pass-and-play and native packages without a rewrite.

The rules live in a standalone, deterministic **engine library** that other projects could reuse. The **app** is only a presentation layer on top of it.

## 2. Goals, non-goals, anti-goals

**Goals (v1)**
- **Play:** two friends play a full game online via a join code, link or QR code, in desktop and mobile browsers. The app is installable as a PWA.
- **Rules:** the rules are enforced exactly as specified in §5. No player can see hidden information they aren't entitled to.
- **Reconnecting:** after a tab or app switch, or from a different device, using a seat token or rejoin code.
- **Pause and resume:** pause and resume later. Completed games are kept in a local history with a turn-by-turn replay and simple stats. Everything can be exported and imported as a single backup file.
- **Engine:** deterministic and hashable state; a command/event API; per-player views; legal-move enumeration; a CLI with unsafe state editing for tests; replays.
- **App:** unit-testable, drivable by an AI agent through its accessibility tree and a dev hook, and tested on desktop, mobile emulation and the Android emulator.
- **Languages:** EN, DE and JA. Accessible (colour-blind safe, readable, screen-reader friendly, reduced motion).
- **Efficiency:** low data use (kilobytes per game) and light on battery.
- **Rulebook:** a rewritten, localised rulebook and a short interactive tutorial.

**Non-goals (v1, but the architecture must allow them)**
- Public matchmaking with strangers, accounts or ratings.
- LAN or offline play without the Internet.
- Pass-and-play, playing against a bot.
- Native .exe / .apk packages.
- Fair-play peer-to-peer mode, where cryptography replaces the referee (see research §19).
- Real artwork, sound and music.

**Anti-goals: failure even if it "works"**
- Hidden information reaches the opponent's device: their hand, their plan before the reveal, or the discarded card *during* the round.
- The client or UI decides rules. Only the engine decides.
- Any dependency on Cloudflare-specific APIs outside one adapter.
- Use of the publisher's artwork, card designs or rulebook text.
- A busy render loop, polling, or keep-alives while hidden, which drain battery and data.
- Colour as the only carrier of information.

## 3. Constraints

- **Cost:** £0 by default. Static hosting on GitHub Pages; the referee runs on the Cloudflare Workers free plan (~100k requests/day, about 500 games/day).
- **IP:** character role names are used as printed. Card art, layouts and rulebook wording are not reproduced. Title and tagline are as stated in §1.
- **Browsers:** current Chrome/Edge/Firefox/Safari, plus Android Chrome and iOS Safari. iOS storage can be evicted unless the app is installed, which is mitigated by the install prompt and backups.
- **One repo** (decided 2026-11-22): `engine/` (Rust workspace, usable standalone) and `app/` (TypeScript pnpm workspace).

## 4. Approaches considered

### 4.1 Platform
| Option | Verdict |
|---|---|
| **PWA (chosen)** | One codebase for every device; no store; works offline once cached; DOM rendering gives accessibility and agent-driving |
| Capacitor or Tauri wrappers | Later, only for native-only needs (LAN hosting, store presence). They reuse the PWA build |
| Flutter, Godot or Unity | Rejected: large downloads, canvas UI (poor accessibility and agent-driving), higher idle power use |

### 4.2 Who enforces the rules online
| Option | Verdict |
|---|---|
| **Referee (chosen)** | A server runs the engine and sends each player only their own view. Simplest; reconnecting from any device is trivial; nobody can cheat; needed for public matchmaking anyway. Downside: the operator could in principle see hands. A seed commitment proves the deals were fair, but not that nobody peeked |
| Fair-play peer | Cryptographic shuffle plus commit–reveal. Nobody is trusted, but much more work, and losing a device mid-round voids the round. Deferred; the authority/transport split keeps it possible |
| Host-authoritative peer | One player's device is the referee, so the host can peek. Only for a future LAN "host mode" |

### 4.3 Engine language
| Option | Verdict |
|---|---|
| **Rust → WASM (chosen)** | One engine for browser, server and CLI; strong enums; deterministic; property testing |
| TypeScript only | Simpler toolchain, but weaker determinism and a weaker fit for a standalone library |

## 5. Game rules specification (authoritative for the engine)

### 5.1 Components
- **Characters** (initiative, name, faction):

  | # | Character | Faction |
  |---|---|---|
  | 1 | Hunter | Human |
  | 2 | Wolf King | Werewolf |
  | 3 | Knight | Human |
  | 4 | Wolfen | Werewolf |
  | 5 | Seer | Human |
  | 6 | Witch | Human |
  | 7 | Wolf Beauty | Werewolf |
  | 8 | Villager | Human |

- **Target cards:** each player has their own 9: one per character plus the **Fool**.
- **Markers in the supply:**

  | Marker | Count |
  |---|---|
  | Cross | 7 |
  | Fang | 5 |
  | Hourglass | 5 |
  | Potion | 1 |
  | Health | 4 (2 per player; never regained) |

- **Badge:** one.

### 5.2 Setup
1. Each player takes 2 Health and 1 Cross. This single Cross is the "both players gain 1 Cross in the first round" on the marker reference; it is not an extra one.
2. The Badge goes to a random player, or the players choose in the lobby.
3. The player *without* the Badge takes 1 Hourglass.

### 5.3 Round
**1. Round start**
- Shuffle all 8 characters with the engine's seeded RNG.
- Discard 1 face-down. It is hidden from both players until the round ends, then revealed publicly *(owner decision, 2026-11-24)*. Players see it as the card "set aside" ("The card set aside in round 2 was the Seer."). Each round is dealt afresh, so this tells no one anything about later rounds.
- Deal 4 to the Badge holder and 3 to the other player. Hands are private.

**2. Plan** (simultaneous; each plan is sealed until both are submitted)
- Each player chooses 1 character from their hand and **at least one** target card (`RulesConfig.min_targets = 1`; a 0 variant exists).
- **Allowed targets by character** (the Fool may be added to any plan, and may be the only target):

  | Character | Allowed target cards |
  |---|---|
  | Hunter | up to 2 Werewolf targets |
  | Wolf King | any number of Human targets |
  | Knight | 1 Werewolf target |
  | Seer | 1 Werewolf target |
  | Wolfen | 1 target, any faction |
  | Wolf Beauty | 1 target, any faction |
  | Witch | Fool only |
  | Villager | Fool only |

- Targets may name a card in the player's own hand. This is legal but pointless; the UI warns.
- The **number** of target cards in each plan is public once submitted. Their identities are not.
- Unchosen hand cards are discarded face-down and stay hidden.

**3. Reveal**
- **A.** The Badge holder chooses how many of their Hourglasses (0 or more) to place on their character. This is public.
- **B.** The other player does the same, having seen A's number.
- **C.** If a player holds the Potion, they **must** spend it:
  - They choose one of their *unplayed* target cards, excluding the Fool.
  - It is revealed publicly as the Potion target, and the Potion returns to the supply.
- **D.** Both plans are revealed. The Fool has no effect.
- Effective initiative = max(0, printed initiative − Hourglasses placed).
- Placed Hourglasses **stay on the character card through Showdown and return to the supply at round end** *(owner decision, 2026-11-22)*. So during Showdown, a Knight or Wolfen gain may have to come from the opponent if the supply is empty.

**4. Showdown**
1. **Potion first.** If the Potion target names the opponent's character, that character is eliminated and its owner loses 1 Health. This works on any faction, including the Witch.
2. **Characters resolve in order:**
   - lowest effective initiative first;
   - on a tie, the player who placed more Hourglasses goes first;
   - if still tied, the Badge holder goes first.

   An eliminated character does not resolve.
3. **Resolving a character.** Effects apply in card order: gain or spend first, then the attack.

   | Character | Effect |
   |---|---|
   | Hunter | Its owner is asked whether to spend 1 Cross. With no Cross, or on declining, there is no attack. Otherwise it attacks its targets |
   | Wolf King | Pay Fangs equal to (number of non-Fool targets − 1). If the owner can't pay in full, they pay nothing and the whole attack fails. Otherwise it attacks all its targets |
   | Knight | Gain 1 Hourglass, then attack |
   | Wolfen | Gain 1 Hourglass, then attack |
   | Seer | Attack; a hit costs the opponent 2 Health instead of 1 |
   | Witch | Gain the Potion |
   | Wolf Beauty | Gain 1 Fang, then attack |
   | Villager | Gain 1 Cross |

4. **Hit rules:**
   - An attack hits if one of its targets names the opponent's character **and** that character has not yet resolved.
   - A character that has already resolved is immune.
   - A hit eliminates the character, and its owner loses 1 Health (Seer: 2).
   - A character can be eliminated only once. Attacks on an already-eliminated character, including one eliminated by the Potion, have no further effect. *(Design call.)*
5. **Gaining markers:**
   - Gains come from the supply.
   - If the Hourglass supply is empty, the Hourglass is taken from the opponent; if they have none, nothing is gained.
   - The Fang and Cross supplies cannot run out before someone wins.
6. **Spent markers** return to the supply.

**5. Round end:**
- Placed Hourglasses return to the supply, and the Badge passes to the other player.
- The round's discarded card is revealed publicly as the card set aside (`DiscardRevealed`, straight after `RoundEnded`). A game that ends during the round never reaches this step, so its last discard stays hidden.
- The game then waits in **Round over** until both players confirm "Next round". Only then is the next round shuffled and dealt (see §6.5).

### 5.4 Game end
These are checked **after every single state change**, and the game ends immediately:
- **0 Health:** that player loses.
- **3 Fangs:** that player wins.
- **4 Crosses:** that player wins.

Resolution is sequential, so two results can never happen at once.

### 5.5 Rules config
```
RulesConfig {
  tiebreak: HourglassesThenBadge,   // current rule (default) | BadgeOnly, for old printings
  min_targets: 1,                   // 1 = default | 0
  badge_start: Random | Chosen,
}
```
The config is fixed at game creation and stored in saves and replays.

## 6. Architecture

### 6.1 Repository layout (single repo, decided 2026-11-22)
```
WerewolfDuelOnline/
engine/  (Rust workspace, MIT/Apache-2.0, usable standalone)
  crates/wwd-core       rules state machine, RNG, hashing, views, legal actions
  crates/wwd-cli        interactive / scripted play, replay, verify, fuzz, --unsafe edits
  crates/wwd-wasm       wasm-bindgen bindings (coarse JSON in/out), built into the engine package
  locales/<lang>/engine.ftl   game-term text, shared with the app
app/     (TypeScript pnpm workspace)
  packages/engine             @wwd/engine: wasm build of wwd-core, generated TypeScript types, typed wrapper; "./wasm" export
  packages/protocol           @wwd/protocol: wire message types, valibot parsing, error codes, constants
  packages/transport          @wwd/transport: Transport interface, in-memory pair, BroadcastChannel transport
  packages/referee-core       Room logic; no I/O, no platform APIs
  packages/referee-memory     in-process adapter (MemoryReferee, BroadcastChannelHost): tests, local play, future pass-and-play/bot
  packages/client-core        GameClient (store, replay verification), ConnectionManager, browser lifecycle, Fluent localiser
  packages/referee-service    the HTTP API, CORS, limits, rate limiting and retention shared by the network adapters; no platform APIs
  packages/referee-node       ws server + JSON file storage: local dev, e2e, Docker, self-host
  packages/referee-cloudflare Worker + Durable Object adapter: the public free deployment
  apps/web                    Svelte 5 + Vite SPA (plain Vite, not SvelteKit), installable as a PWA
scripts/smoke.mjs  post-deploy smoke test of a referee (Node built-ins only)
docs/deploy.md     the deployment guide
```
- **How the app uses the engine:** the engine package (`app/packages/engine`, `@wwd/engine`) is a pnpm workspace package; its build compiles `wwd-wasm`, runs `wasm-bindgen` and exports the `.wasm` file as `@wwd/engine/wasm`. The wire protocol is TypeScript (`@wwd/protocol`), with engine types generated by ts-rs; there is no Rust protocol crate. Nothing has to be published.
- **The engine stays independent:** it never depends on the app. It can be published on its own (crate or npm) or split into its own repo later with `git subtree split`.
- **CI:** separate GitHub Actions workflows per folder (`paths:` filters), plus a `deploy` workflow on `main` (§10).

### 6.2 Engine API
```
new_game(seed: [u8;32], config: RulesConfig) -> State
legal_actions(&State, Seat) -> Vec<Command>
apply(&mut State, Seat, Command) -> Result<Vec<Event>, RuleError>
view(&State, Viewer) -> View          // Viewer = Seat(0|1) | Spectator | Omniscient
pending(&State) -> Pending            // who must act next, and what kind of input
hash(&State) -> [u8;32]               // BLAKE3 over canonical bytes
replay(Replay) -> Result<State, ReplayError>
```

**Commands:**
- `SubmitPlan{character, targets}`
- `PlaceHourglasses{n}`
- `ChoosePotionTarget{card}`
- `HunterSpendCross{yes}`

**Events:**
- Each event carries a visibility: `Public | Seat(n)`.
- Examples: `HandDealt` (Seat), `PlanSubmitted{target_count}` (Public), `PlansRevealed`, `AttackHit{seat, target_seat, attacker, character, health_lost}` (`attacker` is the attacking seat's character, `character` the one hit), `AttackMissed{seat, attacker}`, `GameOver`.
- `DiscardRevealed{round, character}` (Public) follows `RoundEnded`. Until then the discard is in no seat's view or events; `view()` shows it only to `Omniscient`.
- `view()` and the per-seat event filter are the *only* way data leaves the engine for a player.

**Determinism:**
- ChaCha8 RNG whose state is part of `State`.
- `BTreeMap`/`Vec` only; no floats, clock or locale.
- Canonical serialisation (postcard) for hashing.
- `engine_version` is included in hashes and replays.
- **Engine versions:** `ENGINE_VERSION` is the crate version, bumped whenever the same commands produce different state (0.2.0 added `DiscardRevealed`, `AttackHit.attacker` and `AttackMissed.attacker`). A replay from a listed earlier version whose rules are unchanged (0.1.0) still verifies: it is re-simulated under this engine with its seed commitments and every command checked, but its checkpoint hashes, taken over the old log, are not compared. Loading one into a `Recorder` (`from_replay`, `resume`) upgrades it to the current version and takes its checkpoints again. Any other version is rejected.

**Strings:** the engine emits stable IDs and never display text.
- The IDs are the Fluent message IDs themselves, in the form `<kind>-<kebab>`, e.g. `character-wolf-king`, `event-attack-hit`, `error-target-not-allowed`.
- They are exposed via `id()` on characters, events and errors.
- Serde wire names stay snake_case (`"wolf_king"`).

**Replay format:**
```
{format_version, engine_version, config, tainted,
 segments: [{start_state, seed, seed_commitment, commands[], checkpoints[{index, hash}]}]}
```
- A game that is never resumed from a save file has exactly one segment, whose `start_state` is the setup.
- Resuming from a save file (§6.5) starts a new segment with a new seed, beginning from the saved round-boundary state.
- History and stats count the whole thing as one game.
- *(M4)* A resumed segment's log starts with the public `SegmentStarted{round, seed_commitment}`, where `round` is the next round to be dealt. It takes the place of `GameStarted`.

**UI helpers** *(M4)*:
- `validate_plan`, `effective_initiative(character, placed)` and `content_hash(text)` (BLAKE3 of the UTF-8 bytes, for save files and backups).
- `ability_summary(character) -> AbilitySummary{gains, spends, attack, damage, optional_cross}` *(layout pass)*: what a card does, as data for its ability icons. `gains` are markers, `spends` is `One(marker)` (the Hunter's Cross) or `PerExtraTarget(marker)` (the Wolf King's Fangs), `attack` is `{faction, max}` (`None` = any), `damage` is 2 for the Seer and 0 without an attack, and `optional_cross` marks the Hunter's choice. `attack` maps `attack_rule`; `gains`, `spends`, `damage` and `optional_cross` come from the showdown's `gain`, `cost`, `damage` and `asks_owner`, the functions resolution itself calls (every gain, both payments and their markers, the Hunter's prompt and every hit's damage). WASM `abilitySummary`.
- `View.showdown` holds the showdown order from the reveal until the next deal; `showdown_order(view)` returns it. The order isn't recomputed from the view, because at round over the Badge has already passed and the placed Hourglasses have been returned.
  - At the start of a resumed segment `View.showdown` is `None`: the round-boundary state a segment starts from does not carry the finished round's order. A client that resumes therefore shows no showdown list until the next reveal.
- `replay_timeline(replay, viewer)` checks the replay as `verify` does. It returns one step for the start of each segment plus one per entry, so `1 + commands + (segments − 1)` steps.
  - Each step holds the viewer's events and view after that point.
  - Another seat's command is hidden unless the viewer is omniscient.

**Unsafe edits:**
- Behind the cargo feature `unsafe-edit`, used by the CLI's `--unsafe` flag.
- Operations: set markers or health, set hands, set phase, load a state from JSON.
- Any use sets `tainted = true`.
- Never built into the referee or the WASM package.

### 6.3 CLI
```
wwd play [--seed S] [--config ...]   # hot-seat; prints only the acting seat's view
wwd play --script moves.jsonl --json # scripted, machine-readable
wwd replay file.json [--step] [--as 0|1|all]
wwd verify file.json                 # re-simulate, check checkpoints
wwd fuzz --games N                   # random legal play; invariants and determinism
wwd --unsafe edit state.json 'set p1.health 1' 'set p0.hand Seer,Witch,Knight'
```
Output is human text (localised with Fluent `.ftl`, shared with the app) or `--json`.

### 6.4 Wire protocol (versioned JSON over WebSocket)

**Client → referee:**
- `hello{protocol_version, room, seat_token?, last_seq?, name?}`: without a token it claims the next empty seat; with one it resumes that seat, replaying the events after `last_seq`.
- *(M3)* `rejoin{protocol_version, room, seat, pin?, last_seq?}`: takes over a seat from another device. With the right `pin` it gets `welcome` with a new seat token; without a `pin` it asks the opponent to approve (§6.5).
- *(M3)* `approve_rejoin{approve}`, sent by the opponent in answer to `rejoin_request`.
- `command{cmd}`, where `cmd` is any engine `Command`, including *(M3)* `resign`.
- *(M4)* `pause_request`, `pause_accept`.
- *(M4)* `rematch_request`, after game over.
- *(M4)* `hello` may carry `seat`. Only a room created from a save honours it (§6.5); any other room ignores it.
- *(M3)* `claim_win`, after the opponent's grace window has expired.
- `ping`.

**Referee → client:**
- `welcome{seat, seat_token, room, config, pin, game}`. *(M3)* `pin` is the seat's 4-digit PIN, shown under "Continue on another device".
  - *(M4 final review)* **Welcome config:** `config` is the config of the game being played (game `game`), not the room's base config. For a rematch it is the room's rules with `badge_start: {seat: loser}`; for a room created from a save it is the save's config. A client whose first event is a `segment_started` checks the replay against it (§6.6).
- `waiting`, sent to a connection while the opponent seat is still empty.
- `events{game, from_seq, events[], view, legal, pending}`.
- *(M3)* `opponent_status{connected, name?, grace_deadline?, grace_remaining_ms?, can_claim_win?, pin_attempt_failed?}`.
  - `grace_remaining_ms` is computed by the referee whenever `grace_deadline` is sent. Clients time the countdown from its arrival plus the remaining time, never from the absolute deadline, so clock skew between devices does not matter.
  - `can_claim_win: true` replaces `grace_deadline` once the window has passed.
  - `pin_attempt_failed: true` tells a player that someone just entered a wrong PIN for the opponent's seat.
- *(M3)* `rejoin_pending` to the device asking for a seat without a PIN, and `rejoin_request{deadline, remaining_ms}` to the opponent asked to approve it.
  - `deadline` is epoch ms by the referee's clock and is informational. Clients time the request from its arrival plus `remaining_ms`.
  - If the approver's seat is taken over by a new connection (`hello` with its token, or `rebind`) while the request is open, the request is sent again to the new connection, with a fresh `remaining_ms`.
- *(M3)* `rejoin_withdrawn` to that approver when the request is no longer open: it expired, its seat was reclaimed by token or PIN, or the asking connection closed. The approver's dialog also closes itself at `deadline` as a fallback.
- *(M4)* `paused{save}`.
- *(M4)* `rematch_status{ready}`: the seats that have asked for a rematch. A welcome to a finished game sends it after `pause_status` (and `resume_status`, where that applies), before `opponent_status`.
- *(M4)* `welcome` and `events` carry `game`, the room's game index: 0 for its first game, one more for each rematch.
- `game_over{replay}`, sent only at game over. The client rebuilds the game from it and checks it against the commitment announced in `game_started`.
- `error{code}`.
- `pong`.

Notes:
- **Error codes:**
  - `invalid_message`, `too_large`, `protocol_version`, `not_joined`, `room_full`, `unknown_room`, `superseded`, `rate_limited`, `internal_error`.
  - *(M3)* `unknown_seat` (a `hello` whose token matches no seat), `wrong_pin`, `pin_locked`, `not_expired` (a `claim_win` that is too early), `rejoin_declined` (refused or unanswered), `rejoin_unavailable` (the seat can't be requested, or the request was withdrawn) and `room_closed` (the room expired and is being deleted).
  - Engine rejections pass through as the engine's own message id with its `error-` prefix (for example `error-invalid-input`), which the client localises from `engine.ftl`.
  - `internal_error` means the engine itself failed (for example a WebAssembly trap), not that the input was wrong.
- **Closing errors:** `superseded`, `room_full`, `protocol_version`, `unknown_room`, `unknown_seat` and *(M3)* `rejoin_declined` and `rejoin_unavailable` end the connection: the referee sends the error, then closes that connection. The list is `CLOSING_ERROR_CODES` in `@wwd/protocol`; the referee, `GameClient` and `ConnectionManager` all use it. `room_closed` is followed by the adapter closing every socket of the room.
- *(M3)* **Unknown room on upgrade:** a WebSocket upgrade for a join code that is well formed but names no servable room (never created, expired, quarantined or unrestorable) is accepted, sent `error{unknown_room}` at once and closed with code 1008, so the browser learns why and the client stops instead of retrying. It never counts towards any room's connection cap. A malformed code is still refused at the HTTP layer with `404`.
- **Version first:** once a client message has passed the size and JSON checks, a `hello` whose `protocol_version` is a number other than `PROTOCOL_VERSION` gets `protocol_version` before the rest of the message is validated. A client from another version therefore always learns why it was refused, even if other fields have changed shape. A string longer than `MAX_MESSAGE_BYTES` UTF-16 units is rejected as `too_large` without being encoded, because its UTF-8 size can only be larger.
- **Sequence numbers are game-wide:** `seq = segment_base + log_index`. `segment_base` is 0 for the first segment; later segments add the previous segments' log lengths. *(M4)* A rematch starts a new game whose numbering starts again at 0. A `hello` does not yet say which game its `last_seq` is from, so the referee trusts a `last_seq` only while the room is on its first game; after a rematch, a reconnect gets the whole current game from seq 0.
- **Limits:** `MAX_MESSAGE_BYTES` (8192) is enforced on client → referee messages only; the referee is trusted, so server messages have no cap. Each connection may send 30 messages per rolling 10 s; the excess is dropped with `error{rate_limited}`.
- `events` always carries the full redacted `view`, so a client that misses anything self-heals.
- Typical message: 100–400 bytes. A game is roughly 10–40 KB.

**HTTP API** *(M3)*, identical on both network adapters and implemented once in `referee-service`:
- `POST /rooms` with JSON `{config: RulesConfig, grace_minutes: 5|10|30, test?: {grace_ms?, seed?}}` returns `201 {code}`.
  - *(M4)* Or `{save: SaveFile, seat: "p0"|"p1", grace_minutes}` creates a room that continues a save (§6.5), with `seat` kept for the uploader. A body with a save may be up to `MAX_SAVE_BYTES` (262 144); every other body keeps the `MAX_MESSAGE_BYTES` cap. A save that fails verification, including one whose replay has more than `MAX_SAVE_SEGMENTS` (32) segments, gets `400 {error: "invalid_save"}`. The shape is checked by the HTTP layer; the save itself is verified by `Room.fromSave` in `referee-core`, which both adapters reach through `createRequestedRoom`.
  - A disallowed `Origin` gets `403 {error: "forbidden_origin"}` before the rate limit or the body is checked, and isn't counted.
  - The body is capped at `MAX_MESSAGE_BYTES`, or at `MAX_SAVE_BYTES` when it carries a save (`413 {error: "too_large"}`), and validated strictly (`400 {error: "invalid_message"}`).
  - `test` is honoured only when the referee was started with test overrides; otherwise it gets `400 {error: "test_overrides_disabled"}`. `grace_ms` (1 s to 1 h) replaces the grace window, and `seed` (64 hex digits) makes the room's randomness deterministic.
  - `429 {error: "rate_limited"}` after 20 creation attempts per client address per hour (an IPv6 address counts by its /64). Every request from an allowed origin counts, including ones later refused as invalid, so a client cannot probe without limit, and `503 {error: "unavailable"}` if no free join code was found in five draws.
- `GET /rooms/{CODE}/ws` is the WebSocket upgrade. A malformed code gets `404`, a request that isn't an upgrade `426`, and a disallowed `Origin` `403 {error: "forbidden_origin"}`.
- `GET /health` returns `200 {ok: true, protocol_version, engine_version}`.
- Other paths get `404`, and other methods `405` with `Allow`. Every JSON response is `cache-control: no-store`.
- **CORS:** the allowed origins come from the adapter's configuration (`--origins` on Node, `ALLOWED_ORIGINS` on Cloudflare), comma-separated and matched exactly. An allowed origin is echoed back, with `OPTIONS` preflights answered `204`; a preflight from a disallowed origin gets `403 {error: "forbidden_origin"}`. Test overrides also allow `http://localhost:*`. A request without an `Origin` header, such as the smoke test's, is not a browser and is allowed. There is no wildcard.

### 6.5 Referee (`referee-core`)
```
Room.create(code, config, {clock, random}, {graceMs}) / Room.restore(snapshot, deps, {wake?})
room.handle(conn, raw) -> Outbound[]        Outbound = {conn, msg, close?}
room.disconnect(conn) / room.rebind(conn, seat) / room.tick() -> Outbound[]
room.nextDeadline() -> epoch ms | null      room.snapshot() -> RoomSnapshot (v2)
room.revision, room.lastActivityAt, room.finishedAt, room.faulted
interfaces: Clock, Random (seat tokens, PINs, codes, seeds)
```
`referee-core` does no I/O and keeps no timers: the adapter stores snapshots, delivers `Outbound`s and sets an alarm or timer for `nextDeadline()`, calling `tick()` when it fires.

- **Rooms and seats:**
  - Creating a room returns a **join code**: 6 characters, Crockford base32, unambiguous.
  - The first two distinct joiners get seats.
  - Each seat has a 128-bit random **seat token**. Holding the token *is* the identity.
- **Rejoining:**
  - **Automatic:** the same device reconnects with the stored seat token. Nothing to type.
  - **On another device:** enter the **same join code**, then pick your seat ("Rejoin as Alex"), then enter your **4-digit seat PIN**.
    - The PIN is generated per seat when the seat is claimed, sent in `welcome.pin`, and shown in the game menu under "Continue on another device". *(M4)* A QR that encodes code + PIN.
    - The join code alone isn't enough, because the opponent, or anyone who saw the invite link, also knows it.
    - PIN attempts are rate-limited. *(M3)* Up to `PIN_MAX_FAILURES` (5) wrong attempts within `PIN_LOCK_MS` (15 min) get `wrong_pin`. The next wrong one, the 6th, is itself answered `pin_locked` and locks that seat's PIN for 15 minutes; while it is locked, every attempt, even with the right PIN, gets `pin_locked`. Each wrong attempt sends the connected opponent `opponent_status` with `pin_attempt_failed: true`. The failures, the lock and the seat's lockout count are part of the snapshot, so they survive a restore.
    - *(M4)* The lock escalates: the Nth lock since the seat's last successful PIN rejoin lasts `min(PIN_LOCK_MS * 2^(N-1), PIN_LOCK_MAX_MS)`, where `PIN_LOCK_MAX_MS` is 24 h (86 400 000). The failure window stays `PIN_LOCK_MS`. A successful PIN rejoin resets the count, so over a room's 30 idle days a seat gets only a few dozen attempts.
    - *(M3)* A successful PIN rejoin gives the seat a **new seat token**, so the old device's token stops working, and clears the recorded failures. A wrong or locked PIN never claims a seat.
  - **Forgotten PIN:** the connected opponent can approve the newcomer ("Let this device play as Alex?").
    - *(M3)* Only a seat that is **currently disconnected** can be requested this way. A PIN-less `rejoin` for a bound seat gets `rejoin_unavailable` (closing), so a player can never approve their own takeover of the opponent's live seat.
    - *(M3)* Approval-based rejoin of a disconnected seat **trusts the approving opponent**: they could approve a device of their own and see that seat's view. This is accepted for friend games, and it must be disabled for any future public matchmaking.
    - *(M3)* WebSocket upgrades and join-code probing (connecting to guessed codes) are not rate-limited; only room creation is, per IP. The risk is socket churn and slow code enumeration, which is accepted for friend games because each socket is capped, timed out and holds nothing without a seat token or PIN, but public matchmaking must add per-IP upgrade limits.
    - *(M3)* One request may be pending per room. It is persisted in the snapshot, but only a restore that wakes the room (`{wake: true}`, a Durable Object waking from hibernation with its sockets still open) brings it back. A plain restore, such as a Node referee restarting, drops it, because the asking connection is gone. It is withdrawn (`rejoin_unavailable`, closing) when its seat is reclaimed by token or PIN, and when the approving seat disconnects. It is declined (`rejoin_declined`, closing) on refusal or after `REJOIN_APPROVAL_TIMEOUT_MS`. While it waits, the asking connection's `ping` is answered with `pong`, so its keep-alive holds, and every other message gets `not_joined`. Wrong-PIN attempts, PIN lock expiry and unanswered requests don't count as room activity.
  - **Taking over a seat:** the newest connection wins. The previous connection is closed, and the old device shows "Continued on another device".
- **Seed commitment:**
  - The game seed comes from the referee's CSPRNG.
  - `hash(seed)` is sent at game start, and the seed is revealed in `game_over`.
  - Clients verify the replay.
- **Reconnection:**
  - On reconnect, `hello{seat_token, last_seq}` gets back the missed events, redacted.
  - A **grace window** (default 10 min, chosen at creation) starts while a seat is disconnected. The opponent sees a countdown.
  - When it expires, the opponent may keep waiting, propose a pause, or claim the win.
  - *(M3)* Grace applies only while a game is in progress (started, not over). It starts when a seated connection disconnects, or at game start for a seat that isn't connected then. The waiting seat's `opponent_status` carries `grace_deadline` (epoch ms) until it passes, then `can_claim_win: true`. `Room.tick()` announces an expiry once, and the snapshot's `grace_announced` records that it has, so a restore with `{wake: true}` doesn't announce it again; `Room.nextDeadline()` gives the adapter its next alarm time. Reconnecting clears the window. Restoring a room with a game in progress starts a fresh window for **both** seats at restore time, since no seat is bound yet; server downtime therefore never counts against an absent player, and an earlier recorded deadline is discarded. A restore with `{wake: true}` instead keeps each recorded disconnection time, because the referee never stopped, and starts a window only for a seat that had none.
  - *(M3)* `claim_win` before the deadline, against a connected opponent, or before the game starts gets `not_expired`; after game over it gets `error-game-over`. Otherwise the referee applies `Command::Resign` for the absent seat, and the bound seats get the usual `events` and `game_over`.
- **Pause** *(design call)*:
  - **Timing:**
    - A pause request takes effect **at the end of the current round** ("Pause after this round"), so a bad hand can't be redealt by pausing.
    - Mid-round interruptions are handled by reconnection, not pause.
  - **Round over, the pre-deal stop** *(revised 2026-11-22 after the M1 final review)*:
    - After Showdown, the engine stops in `Phase::RoundOver`, before the next deal. Each seat sends `Command::NextRound` (the "Next round" button). When both have done so, the next round is dealt.
    - This is the only **round boundary**: nothing is dealt yet, so the state holds no secrets.
  - **Every pause reseeds:**
    - Pausing happens only in `RoundOver`.
    - It **closes the current segment**, revealing its seed (all of its deals are finished), and resumes in a **new segment with a fresh seed**.
    - A revealed seed is therefore never live, and future deals stay unpredictable.
  - **Resuming normally:**
    - A paused room **stays on the referee** (retention below). Resuming is simply both players reconnecting with their seat tokens.
    - The referee starts the new segment.
  - **Save file as a fallback:**
    - On pause, the referee also sends both clients a **save file**: the boundary state, config, and the replay-so-far, including the closed segments' seeds so their deals can be verified.
  - **Rematch** *(M4)*: after game over, once both bound seats send `rematch_request`, the room starts its next game with a fresh seed and the Badge starting with the loser (`badge_start: {seat: loser}`; the room's own config is unchanged). Seat tokens, PINs and names are kept, `finished_at` is cleared, and both seats get `events` for the new game from seq 0. Readiness, like resume readiness, belongs to a connection: a seat that disconnects or reconnects must ask again. The finished game's replay is sent to a reconnecting seat only until the rematch starts.
  - **Current game config** *(M4 final review)*: besides its base config, a room keeps the config of the game being played, which its `welcome` sends. It is the base config when the room is created, the save's config for a room created from a save, and the rematch config once a rematch starts. It is not a snapshot field: every restore, plain or waking, rebuilds it from `replay.config` (the base config while there is no game), so snapshot v3 is unchanged.
  - **Resuming from a save file:**
    - *(M4, decided)* A single upload is enough (friend mode): `POST /rooms` with the save and the uploader's seat. The referee checks `format_version` and `kind`, the `hash`, that the replay verifies and is untainted, that the save's config is the replay's, and that the replay ends at exactly the save's `boundary`. The room then starts paused with both seats unclaimed: a tokenless `hello` naming the uploader's seat claims it, any other tokenless `hello` claims the other seat, and resuming works as for any paused room. The hash only detects damage; it is not a signature, so the trust rests on verifying the replay.
    - A save may have at most `MAX_SAVE_SEGMENTS` (32) replay segments, one per pause; the count is checked before any engine work, since working out the game-wide numbering replays each prefix of the segments.
    - Single-upload resume trusts the uploader: a rule-valid replay built from seeds of their choosing also verifies. This is accepted for friend games; public play would need both players' saves or saves signed by the server. The joining player sees the restored round and markers before pressing Resume.
    - Used if the room has expired, or the players move to another server.
    - Either player creates a room from the save, with a single upload (above). The referee verifies the replay first.
    - This starts a new segment with a new seed.
  - **Hashes:** a hash of the whole state, which includes the live seed, may be sent to clients. Hashes that could be brute-forced against hidden plans must not be sent.
  - **Notes for M2** (from the M1 final review):
    - **Never send a raw `State` to a client.** It holds the live seed and seat-private events. Only `view()`, `events_since()` and `RoundBoundary` leave the referee.
    - **Event sequence numbers restart at 0 in each segment.** The referee's `last_seq` must be game-wide, e.g. a segment index plus the log index.
  - **Notes for M3** (from the M2 final review), all done in M3:
    - **Network adapters must cap their own inputs.** *Done:* a 16 KiB frame cap, a 10 s deadline for the first `hello` or `rejoin`, at most 8 connections per room, idle sockets closed after 75 s, and handler exceptions isolated per connection (see Adapters, below).
    - **Don't persist a faulted room:** don't call `snapshot()` on a room that is `faulted`. *Done:* a faulted room is never written. It is dropped from memory and later restored from its last good snapshot, and it is quarantined after repeated faults.
    - **On restore, rebind only the sockets the adapter knows**, and close any others. *Done* in the Durable Object, from each socket's serialised attachment.
    - **Decide the policy for a `hello` carrying an unknown token on a non-full room.** *Done:* it gets `error{unknown_seat}` and the connection is closed, whether or not the room is full; it never claims a seat. The client then offers "Join as a new player" (a `hello` without a token) only if the room isn't full.
    - **Mobile lifecycle:** handle `pageshow` with `persisted` (back/forward cache), and add a reconnect controller around `GameClient.attach`. *Done:* `ConnectionManager` (§6.6).
    - **Add an e2e seed.** *Done:* with test overrides on, `POST /rooms` takes `test.seed`, and the room then draws its tokens, PINs and game seed from `seededRandom(seed)` in `referee-service`. Production always uses `crypto.getRandomValues`.
  - **Notes for M4** (from the M3 final review), all done in M4:
    - **Unload idle rooms on Node.** *Done in M4:* a room with no connections for `IDLE_UNLOAD_MS` (10 min) is written if its revision changed and dropped from memory, and the next connection reloads it from its file.
    - **Bound PIN attempts over a room's lifetime.** *Done in M4:* the lock escalates (see Rejoining).
    - **Build the Docker image once** before advertising self-hosting. *Done in M4:* the `docker` job in `app.yml` builds it and smoke-tests the running container on every push and pull request that touches `app/`, `engine/`, `scripts/` or the workflow itself (the workflow is path-filtered), and on a manual run.
    - **Say when the server is unavailable, not the player's connection.** When a Cloudflare free-plan daily limit is reached, or the referee is down, the browser sees only a failed request: Cloudflare's own error response carries no CORS headers, so the app can't read it. Today the player is told "check your connection" when creating a game, or sees "Connection lost; trying again" indefinitely. Two changes:
      - When `navigator.onLine` is true but the referee can't be reached, word the message as the server not responding ("try again later"), not as the player's connection.
      - After a few minutes of failed reconnects while online, replace "trying again" with a calm notice: the server may be unavailable for a while, the game is kept on the server, and the same link works later. Reconnecting continues in the background.
      - Neither message may claim the daily limit as the cause, since it can't be detected.
      - *Done in M4:* `ConnectionManager` takes `isOnline` (the web app passes `navigator.onLine`) and sets `serverUnavailable` after `SERVER_UNAVAILABLE_AFTER_MS` (180 000) of failed connections while online; time offline or in the background doesn't count, and the next pong clears it. The banner then says "The game server isn't responding. Your game is kept on the server; this link will work again later."
- **Retention:**
  - Room data is deleted 24 h after a game ends (`FINISHED_ROOM_TTL_MS`).
  - Idle unfinished or paused rooms are deleted after 30 days without activity (`IDLE_ROOM_TTL_MS`).
  - *(M3)* The connected sockets of an expiring room are sent `error{room_closed}` and closed. `isExpired()` in `referee-service` decides expiry for both adapters.
  - Saves also live on the clients.
- **Abuse limits (cheap, from day one):** a message size cap (8 KiB per message, 16 KiB per frame), a per-connection rate limit (30 messages per 10 s), and a cap on room creation per IP per hour (20, adapter-level).
- **Snapshot v3** *(M4)* adds `pause`, `game`, `rematch_ready`, `pin_lockouts` and `from_save` (`{reserved_seat}` while a room created from a save still has a seat to claim, else `null`). Like `resume_ready`, `rematch_ready` is read only by a waking restore. `pin_lockouts: [n, n]` records each seat's lockout count. v1 and v2 snapshots upgrade with no pause, game 0, no rematch readiness, no `from_save` and no lockouts; a v3 snapshot written before one of these fields existed restores with its default.
- **Snapshot v2** *(M3)*: `{version: 2, code, config, seats, replay, segment_base, grace_ms, disconnected_at, pins, pin_failures, pin_locked_until, last_activity_at, finished_at, pending_rejoin?, grace_announced?}`, with times in epoch ms. Like `pending_rejoin`, `grace_announced` is read only by a waking restore, and an absent one means no expiry has been announced.
  - A v1 snapshot is upgraded on restore, taking the restore time as its last activity. Its seats get PINs the next time they are welcomed.
  - `room.revision` increases with every change to the persisted state, including failed PIN attempts. Adapters write a snapshot only when it has changed, taking it lazily at write time.
- **Outbound messages** *(M2)*: `Room.handle` and `Room.disconnect` return `[{conn, msg, close?}]`. When `close` is `true`, the adapter delivers `msg` and then closes `conn`. The room sets it on the closing errors (§6.4): `superseded` goes to the old connection, and `room_full`, `protocol_version`, `unknown_room`, `unknown_seat`, `rejoin_declined` and `rejoin_unavailable` go to the connection they answer. An adapter that answers a connection before routing it to a room follows the same rule, using `closesConnection(code)`.
- **Rebinding after a restore** *(M2)*: `Room.rebind(conn, seat)` is for an adapter that restores a room from its snapshot while its sockets stayed open, such as a Durable Object waking from hibernation.
  - It binds `conn` to `seat`, with the connection's high-water mark at the current log length, so nothing is resent.
  - It returns `[]`, or, when the opponent seat is also bound, an `opponent_status{connected: true}` to each of the two connections.
  - It returns `error{not_joined}` if the seat has no record, and it never throws.
  - Adapters should rebind every open socket before handling any close.
  - A client that gets `not_joined` while holding a seat token re-sends `hello{seat_token, last_seq}` on the same connection, once per run of consecutive `not_joined` errors. This recovers a socket that the adapter could not rebind.
- **Engine faults** *(M2)*: the engine package raises `EngineError` for an engine failure that carries a message id, and `EngineFault` (with the original as `cause`) for any other thrown value. When the room meets an `EngineFault`, it sets `faulted`, which is exposed read-only, and replies `error{internal_error}`. Every later `handle` replies `internal_error` without touching the engine. `handle` never throws.
- **Adapters** *(M3)*. Each network adapter:
  - serves the HTTP API (§6.4) through `handleHttp` from `referee-service`, and performs the WebSocket upgrade it returns;
  - accepts an upgrade for a well-formed code with no servable room only to send `error{unknown_room}` and close it with 1008 (§6.4);
  - caps frames at `MAX_FRAME_BYTES` (16 384), closes a connection that sends no valid `hello` or `rejoin` within `PRE_HELLO_TIMEOUT_MS` (10 s) with 1008, turns away connections beyond `MAX_CONNECTIONS_PER_ROOM` (8), and closes a socket that sends nothing, pings included, for `IDLE_TIMEOUT_MS` (75 s) with 1001;
  - writes the room's snapshot when `revision` changes, and never for a faulted room;
  - keeps one timer or alarm for the earliest of `nextDeadline()`, the room's expiry and its sockets' timeouts, and calls `tick()` when it fires;
  - closes every socket of a faulted room with 1011 and drops the room from memory, so the next connection restores its last good snapshot. Three faults within an hour quarantine the room: it is no longer served, and its data is deleted within 24 h;
  - honours `test` room options only when started with test overrides, which also allow `http://localhost:*` origins;
  - never logs seat tokens, PINs or message bodies.
- **The Node adapter** (`referee-node`) uses `ws`. Rooms live in memory and in `<data>/<CODE>.json`, loaded lazily, and a room with no connections for `IDLE_UNLOAD_MS` (10 min) is written and unloaded. Snapshot files, which hold seat tokens and PINs, and their temporary files are created with mode `0600`. It closes a socket with 1013 when more than 1 MiB of output is unread. With `--trust-proxy` it rate-limits by the last `X-Forwarded-For` hop. Its Docker image is the self-hosting option.
  - *(M4)* A snapshot rename that the file system refuses because the target is open elsewhere (`EPERM`, `EACCES` or `EBUSY`, as Windows does while a reader or a virus scanner holds the file) is retried six times with a doubling delay from 10 ms, so a write is not lost to a passing reader.
  - *(M4)* The programmatic `roomCreateLimit` option replaces the 20-per-hour room-creation limit, for end-to-end runs that create more rooms than that. `startReferee` refuses it unless test overrides are on, and the CLI doesn't offer it.
- **The Cloudflare adapter** (`referee-cloudflare`) is a Worker that serves the HTTP API and hands each upgrade to the Durable Object named by the join code.
  - The object uses the Hibernation WebSocket API, SQLite-backed storage and a single alarm. `ping` is answered with `pong` by the runtime's auto-response, without waking the object.
  - Each socket's serialised attachment holds `{conn, seat}` and its timestamps. An object woken after eviction restores the room with `{wake: true}`, rebinds every attached socket and closes any socket without an attachment, so play continues with no `not_joined`.
  - The Workers runtime passes the compiled `WebAssembly.Module` to `initEngine`.
  - Room creation is rate-limited per Worker isolate, not globally, and Workers sockets have no `bufferedAmount`, so there is no backpressure check. Both are accepted for a hobby deployment.

### 6.6 Client (`client-core` + `apps/web`)

- **`Authority` interface:**
  - `RemoteReferee` (v1).
  - Later: `LocalReferee` (memory adapter, used for pass-and-play, vs-bot and LAN host mode) and `FairPlayPeer`.
- **`Transport` interface:** `WebSocket` (v1), `InMemory` (tests), later `WebRTC`.
  - **Contract** *(M2)*: `send` never throws. Text sent before the connection is open is queued by the transport and flushed when it opens. Text sent after close is dropped.
  - `onClose(cb: (info?: {code, reason}) => void)` passes the close frame's code and reason when they are known. The in-memory and `BroadcastChannel` transports pass `{code: 1000, reason: ''}`.
  - *(M3)* The optional `onOpen(cb)` fires once the connection is open: on the WebSocket's `open` event, and on the next microtask for the in-memory and `BroadcastChannel` transports.
- **Keepalive** *(M2)*: `GameClient.ping()` sends `ping` if the client is attached. Each `pong` sets `lastPongAt` in the store from the client's injected `now()`, which defaults to `Date.now`. The reconnect policy and watchdog live outside `GameClient`, in `ConnectionManager` (below).
- **Local mode (M2):** the host page runs a `MemoryReferee` and bridges guests over a per-room `BroadcastChannel` (channel name derived from the room code). Host presence is a Web Lock named for the room: a guest joins only while the lock is held and leaves when it is released, so a closed or crashed host tab is noticed without unload events. Trust is single-user: any page of the same origin can speak on the channel, which is acceptable because both seats belong to one person on one device. The guest keeps its seat token and last sequence number in `sessionStorage` so a reload rejoins the same seat. *(M3)* Local mode lives at `#/local/host` and `#/local/join`.
- **Online mode (M3):**
  - Routes: `#/online/new`, `#/join[/CODE][?server=…]`, `#/rejoin[?code=&seat=&server=]`.
  - Each online seat is kept in `localStorage` under a key made from the referee URL and the room code, holding `{room, seatToken, server, lastSeq, savedAt}`, pruned after 30 days. A link naming another server never reads, overwrites or clears the default server's entry.
  - A `server=` that isn't the default needs an explicit "Connect to <host>?" confirmation before anything is sent, on Join and Rejoin alike. Production builds refuse plain `http:` servers other than `localhost`, `127.0.0.1` and `[::1]`.
  - The default referee is the build's `VITE_REFEREE_URL`. A production build without a usable one fails at start-up rather than quietly using another server.
  - Invite links are `<app base URL>#/join/<CODE>`, plus `?server=<url-encoded>` only when the server isn't the default. The base URL includes any sub-path the app is served from.
  - A wrong or locked PIN while holding no seat token ends that rejoin attempt (`rejected`), so a PIN is never re-sent automatically.
  - After `unknown_seat`, the client offers "Join as a new player" (a `hello` without a token) only if the room isn't full.
- **Base path** *(M3)*: the build's public path comes from `BASE_PATH` (for example `/<repo>` for a GitHub Pages project site) and defaults to `/`. Every asset URL, the engine's WebAssembly included, is under it, and routes are hash routes relative to the page. *(M4)* The PWA manifest's `start_url` and `scope` and the service worker's scope must be relative to the base too.
- **Game store:**
  - Holds the latest `View`, `legal`, `pending`, the event log and connection status.
  - `errorCount` increments on every reported problem, so a repeated error code is still a change the UI can react to.
  - `replayVerified` is set at game over and is true only when every segment start the client received announced its segment's seed commitment (`game_started` for the first segment, `segment_started` for each one after a pause), the replay's config equals the announced config, and the events rebuilt from the replay (its timeline, across every segment) end with exactly the events received.
    - *(M4)* A client that joined a game continued from a save first hears of it at a `segment_started`, so it checks the segments from there on; the earlier ones were verified by the referee when the room was created, under the single-upload trust (§6.5). Each game is checked against its own `game_started` config. The welcome's config is used only for a client whose first event is a `segment_started`. *(M4 final review)* It is the current game's config (§6.4), so a seat that reloads during a paused and resumed rematch game still verifies its replay; before this fix the welcome carried the room's base config, whose Badge start differs from a rematch game's, and such a reload reported `replay_mismatch`. A client whose first event is `game_started` must have received every event the replay rebuilds.
  - *(M4)* The store also holds `game` (from `welcome` and `events`), `pause {requestedBy, agreed, paused, resumeReady}`, the `save` from `paused` and `rematchReady`. A change of `game` drops the view, the log, the replay and its verification, the pause and the rematch readiness; the client stays `connecting` until the new game's events arrive. A new connection forgets both readinesses, since they belong to a connection. While paused, `legal` is empty, since the referee refuses commands. A `hello` still carries no game index, so after a rematch the referee resends the whole current game.
  - The UI is a pure function of the store.
  - The UI only offers actions from `legal`. Invalid actions can't be expressed.
- **Mobile lifecycle** *(M3: `ConnectionManager` with `browserLifecycle()`)*:
  - On `visibilitychange` → hidden: close the socket. No heartbeats while hidden.
  - On visible, on `pageshow` with `persisted: true` (back/forward cache) and on `online`: open a fresh connection and resume with `last_seq`, so no event is applied twice.
  - A new connection must open within `CONNECT_TIMEOUT_MS` (10 s). Once open it is pinged and must answer within `PONG_TIMEOUT_MS` (3 s).
  - While visible, ping every `PING_INTERVAL_MS` (30 s); each ping must be answered before the next one is due.
  - Watchdog: if a ping goes unanswered, or the ping timer fires more than `TIMER_JUMP_MS` (10 s) late (the device was suspended), reconnect.
  - A lost connection is retried after 0.5 s, 1 s, 2 s, 4 s, 8 s and then every 15 s, each delay scaled by a random ±20 %. The backoff resets only once a connection has answered a ping, so a referee that welcomes and then drops connections can't cause a reconnect storm.
  - Reconnecting stops on rejection or after a closing error code, and `stopReason` says which. *(M4)* It no longer stops at game over: the connection is kept so that a rematch can start, and a reconnect after game over must ask for the rematch again. `start()` after `stop()` clears it and connects again, for a fresh attempt such as joining as a new player.
  - The store's connection `phase` is `online`, `connecting`, `offline` or `hidden`, with the retry count and when the next retry is due, for the connection banner.
- **Dev agent hook** (dev builds only):
  - `window.__wwd = { state(), legal(), act(cmd), describe() }`
  - `describe()` returns the same text as the screen-reader "describe table".

## 7. Data on the device

- **IndexedDB** (via `idb`) holds:
  - `settings`
  - `identity` (display name, generated device id)
  - `sessions` (active, paused and finished: room, seat token, server URL, save, timestamps)
    - *(M4 final review)* **Session status and Continue:** each stored seat records the opponent's display name (from `opponent_status`) and the game index (once a `welcome` has said it), and writes again when the name changes. At `game_over` its status becomes `finished`, with `finishedAt` set when the game was first seen to end; a reload of the finished game keeps it finished, and a rematch (a later game index) makes it `active` again. Home's Continue lists it as "Game over · rematch possible" with the opponent's name. A finished session is pruned 24 hours after `finishedAt`, matching the referee's `FINISHED_ROOM_TTL_MS`, as well as by the 30-day limit.
  - `history` (completed games: full log after the game, result, metadata)
- Call `navigator.storage.persist()`.
- **Where data lives:** everything above is stored only on the device, in the browser's IndexedDB for the app's origin. There are no accounts. The referee holds only the live room (display names, seat tokens, the game in progress) until its retention expires (§6.5), and an opponent's device keeps its own history of shared games.
- **Clear history** deletes `history` only. **Delete all data** deletes every store (settings, identity, sessions, history) and returns the app to its first-run state. Both need a confirmation dialog that names exactly what will be deleted, warns that paused and active games can't be resumed afterwards, offers "Export backup first", and states that it affects this device only (opponents keep their copies, and online rooms expire on their own). Destructive buttons carry a warning icon as well as colour.
  - *(M4)* Delete all data also removes the M3 `localStorage` session keys. Other open tabs of the app are not reset: they keep what they hold in memory until reloaded, and may write it back. This is accepted for M4.
- **Installing the app (PWA):**
  - Settings → General has an **Install app** row. It shows an Install button where the browser provides an install prompt (`beforeinstallprompt`: Chrome and Edge on desktop and Android); the Share → "Add to Home Screen" steps on iOS Safari; "Installed" when running in `display-mode: standalone`; and is hidden where installing is impossible (e.g. Firefox desktop).
  - Home shows a dismissible **Install the app** card after the first finished game, never on a first visit. *(Owner decision, M4)* It stays on Home, on every visit, until it is dismissed; dismissing it hides it for good (remembered in settings).
  - On iOS the card's text mentions keeping saved games safe, because Safari may evict storage for sites not visited for 7 days unless the app is installed.
  - *(M4)* The card and the row show the browser's Install button where it offers a prompt, and the share button → “Add to Home Screen” steps on iOS Safari (not other iOS browsers; a third-party label in curly quotes keeps its own capitals); the card shows only where installing is possible. Its text suits desktop and mobile alike. Dismissing it, and the first-game flag, are saved through the same merged, one-at-a-time settings write as the Settings screen, and moves focus to the Settings button above it.
  - *(M4)* **Service worker** (`vite-plugin-pwa`, `registerType: 'prompt'`, generated with Workbox): precaches the app shell (HTML, JS, CSS), the engine WebAssembly, the start-up fonts (Atkinson Hyperlegible Next 400 and 700 and Marcellus 400, Latin woff2; Cinzel was dropped 2026-11-24) and the icons. Lexend and OpenDyslexic font files are cached on first use (cache-first, same origin only). Navigations fall back to `index.html` (routes are hash routes), except under `/rooms`. Nothing from the referee is cached: it is another origin, and WebSockets never pass through a service worker. Outdated precaches are removed when a new version activates.
  - *(M4)* **Updates:** a new version waits until the player chooses. While one is waiting, a status banner says "A new version is available" with Reload, which activates it and reloads every open tab that saw it, so no page mixes old and new assets. A `protocol_version` stop offers the same Reload; when no new version is waiting yet, it first asks the browser to check for one and waits up to 10 s for it to install, since a plain reload would be served the cached old version.
  - *(M4)* The app icon is our own: a crescent moon in the Moonlit palette, SVG plus PNGs (192, 512, maskable 512, and a 180 px Apple touch icon) rendered from it by `pnpm --filter @wwd/web icons` with Playwright's Chromium.
- **History stats:**
  - win/loss by win condition (health / fangs / crosses / resignation);
  - character pick frequency and success rate;
  - average rounds per game;
  - results per opponent display name.
  - *(M4)* Every figure is read from facts the engine emitted when the stored replay is played with the omniscient viewer, never from rule logic in the app. The record's seat is "you"; only your own picks count. A **pick** is a character in your revealed plan (`plans_revealed`). A pick **succeeds** when, after its `character_resolved`, and before the next character resolves or the round ends, the engine emitted an `attack_hit` or a `marker_gained` for your seat. A pick that is forfeited (`attack_forfeited`), misses (`attack_missed`) or never resolves scores no success. The **success rate** is successes over picks, and is shown as "Not picked" for a character never picked. **Rounds** is the highest `round_started` round. A replay this build cannot play still counts, using the result stored in its record, and adds nothing to the pick figures.
- **Replay viewer:** step by round and phase. Show "my view" or "full" (the full log is shared by the referee after the game ends).
  - *(M4)* Routes `#/history` (list, newest first, with a link to Stats), `#/history/<id>` (replay) and `#/stats`. The viewer steps one command at a time (the left and right arrow keys, or the Previous step and Next step buttons), jumps to the previous or next round start, and switches between **My view** (the record's seat) and **Full** (the omniscient viewer). Both are built with `replayTimeline`, so My view never holds the opponent's hand or command. The step position is announced as "Step 12 of 40, round 3". There is no animation.
- **Backup file** `werewolf-duel-backup-YYYYMMDD.wwdb`:
  - gzip JSON: `{format_version, exported_at, settings, identity, sessions, history, checksum}`.
  - Export via the save-file picker, a download, or the share sheet.
  - Import shows a preview and then merges by ID.
  - *(M4)* `BACKUP_FORMAT_VERSION` is 1. An import larger than `MAX_BACKUP_COMPRESSED_BYTES` (5 MiB), or that grows past `MAX_BACKUP_BYTES` (20 MiB) while it is decompressed, stops at once as unreadable. Each session is checked: its id must be the one made from its server and room, and its server must parse. The import keeps this device's own device id and adopts the backup's display name only when this device has none. Settings are replaced only when "Replace my settings with the backup's" is ticked. The export warns that the file holds seat tokens.
    - *(M4 final review)* **Backups and the server setting:** an import never takes the backup's `settings.server`, even with "Replace my settings" ticked; this device keeps its own referee server, so a backup file can't move the device to another referee. The preview's "settings differ" ignores the server too.
    - *(M4 final review)* **Backup session checks:** a session's `room`, and its `resumedAs` when present, must each be a well-formed join code (exactly as `normaliseCode` would write it). A session that fails is dropped and counted as skipped, like one with a wrong id or server. A `finished` status with its `finishedAt` is accepted.
- **Schema versioning:** `format_version` and ordered migrations for saves, history and backups. Replays re-simulate using the recorded `engine_version`. The engine package keeps the old rules modules needed for that.

## 8. User experience

### 8.1 Screens (see mockups)
*(layout pass, Task 13)* **Every screen** is a phone column (at most 30rem wide, centred) with the Moonlit bar at the top: ← or ☰ on the left, the emblem and title, and the screen's own button on the right. Banners sit right under the bar. On a screen that scrolls (Settings, History, Stats, About, How to play, …) the bar and its banners stay at the top while the body scrolls under them, as on the game screens, and the page keeps a focused element clear of them (scroll padding follows their height). A route change scrolls to the top and focuses the h1. Game screens fit 360 × 640 and 390 × 844 with no scrolling at 100 % text; above 100 % only the middle scrolls. No screen scrolls sideways at 320 px, and every screen keeps its bar, cards and phase bar whole, without overlaps, at 150 % text with 24-character names. The development gallery (`#/dev/gallery`, with `?names=long` after an entry's id for 24-character names) is the living reference for every screen, dialog, sheet and banner, including those the mockups do not show; `pnpm --filter @wwd/web visual` draws it beside the mockups.

1. **Home**
   - Continue (active or paused sessions), New game, Join game, How to play, History, Settings.
   - *(layout pass, 2026-11-24)* Home has no "Play on this device" or "Rejoin with PIN" entries: New game offers playing on this device, and Join game leads to the seat and PIN when the room has already started. The bar title is mixed case ("Werewolf: Duel! Online").
   - The dismissible **Install the app** card (see §7) sits below the main buttons when shown.
   - Footer, four short lines: "Made by David F Dev"; "An unofficial digital version of Werewolf: Duel!"; "Not affiliated with Whales Entertainment."; and a link "Get the physical game ↗" to `https://boardgamegeek.com/boardgame/436306/werewolf-duel#buyacopy`, opening in a new tab (`rel="noopener noreferrer"`, accessible name includes "opens in a new tab").
2. **New game:**
   - Rules options: Badge (random / choose), reconnect grace time, advanced variants.
   - Then the **Invite** sheet: join code, QR, Share link (`https://duel.example.com/#join=K7Q2MX`), and a "waiting for opponent" status.
   - *(layout pass, 2026-11-24)* A first "Play" choice: Online (default) or On this device. On this device hides the rules options (a game on one device uses the default rules) and creating opens the local host. *(Task 14, owner 2026-11-25)* The option reads "This device", and one one-line hint under the choice describes only the selected option: "Play a friend anywhere with a join code." (Online) or "Two tabs of this browser, to try the game out." (This device); the choice is described by it. While the room is created, "Creating the game" shows the waiting spinner.
   - *(layout pass, 2026-11-24)* Each rules option is a segmented row: "Badge (first player)" (Random / I start / Opponent starts), "Reconnect grace" (5 min / 10 min / 30 min; not C2's "5m", which screen readers read as metres, since the labels are the options' accessible names), and an Advanced disclosure (tiebreak, minimum targets); the primary "Create game" button sits at the bottom. The Invite screen ("Invite a friend") shows a centred panel with the join code, the QR code, "Copy code" and "Share link" (which copies the link where the browser has no share sheet), then the room's rules as chips in a panel (from the referee's welcome; the reconnect grace is not sent to clients, so it has no chip), then a status panel ("Waiting for your opponent…", which changes when the opponent connects). The local host mirrors it with the code, "Copy code", the instructions and the status. *(Task 14)* The status panel leads with the waiting spinner while it waits and with a green dot once the opponent is there; the Invite screen has no "Continue on another device" (it stays in the game menu).
3. **Join:** enter the code, scan a QR, or open the link directly. Ask for a display name on first use.
   - *(layout pass, 2026-11-24)* The same "Play" choice sits above the code, with its own hints *(Task 14)*: "Enter the code your friend shared." (Online) or "Enter the code shown in the other tab." (This device), on Join and on the local join alike; This device opens the local join with the code (`#/local/join?code=…`), which joins at once. When an online join is refused because the room already has two players, the error offers "Rejoin with your PIN", which opens the PIN flow for the same code and server.
   - *(layout pass, 2026-11-24)* Join, local join and Rejoin are one kit panel each: the "Play" row (Join and local join only; Rejoin is online only), the code in a large monospace field, and a primary action. Rejoin adds the seat as a segmented choice and the PIN. The display name question and the confirmation before using another server are modal dialogs (Escape skips the name question, or cancels the server and returns Home).
4. **Game table**, one adaptive layout:
   - Opponent strip: name, connection dot, Health, Cross, Fang, Hourglass, Badge, hand-size, and plan status.
   - Table area: plans, revealed cards, Potion target, and the initiative order track.
   - My area: hand, target-card row with the deduction tracker, my markers. *(superseded by the layout pass: see the Frame note below and Plan)*
   - A **phase bar** with a one-line instruction and the primary action button.
   - A log/rules drawer.
   - *(layout pass, 2026-11-24)* **Frame:** the table is one screen. The bar shows ☰ (the game menu sheet: pause, continue on another device, describe table, resign and the unofficial notice), the title "Round N" ("Round N · Showdown" from the Hunter choice to round over) and ≡ (the log and rules sheet, with the ability legend). Connection banners are slim strips under the bar; while online with nothing to report the banner is read by screen readers only, so "Connected" is never shown twice. The opponent strip holds the name (one line, cut with an ellipsis when long; the full name is its `title` and in the strip's accessible name), the connection dot and word, the markers as compact counts, the hand size and a chip: their plan status ("Sealed · 1 target" with a tick, on one line; a revealed plan names only its character), or "Waiting for you" outside the plan when only this seat is asked to act. *(Task 14)* The opponent's Badge chip ends the second row, right-aligned under the plan status chip. My strip is a row at the bottom of the body: my markers, a Badge chip when I hold it, and "You". Between the strips sits one phase panel set at a time. The phase bar is the screen footer: four step bars (Plan, Reveal, Potion or Showdown, Round over), the step name, the instruction, the rules hint and the primary action. Each phase panel hands its one pending primary action to the phase bar: Seal plan, Place N Hourglasses, the Potion confirmation (choosing a Potion card only aims it; the bar's button sends it), Next result beside Next round while the showdown is stepped, and Resume alone while paused. The Hunter prompt's two choices stay inline, and the bar gives its instruction only; while this seat only waits the bar has no button. *(Task 14)* "Waiting for your opponent." is followed by the waiting spinner, and Seal plan and Place N Hourglasses hold one from the moment they are sent until the referee answers. If the phase changes while a sheet is open, focus moves to the new action when the sheet closes. The "Table" heading, "Status: Playing", the "In play" panel and the inline menu and log are gone; in the plan phase the Targets panel and my hand fill the middle (see Plan), and the showdown order sits in the showdown's plan panels (Task 9).
   - *(layout pass, 2026-11-24)* **Dialogs, sheets and banners** (mockup 9): every dialog is the kit dialog: modal over a scrim, a 14 px-radius surface, a Marcellus title (a destructive question starts it with the warning icon, hidden from screen readers), 13 px body text with lists for what it names, and the answers stacked full width: a safe alternative first ("Export backup first", Share), then the main or destructive answer, then Cancel. Cancel (the safe answer), or the field to fill, takes focus. Escape cancels and focus returns to the opener. *(Task 13)* Only the first answer counts: once a question is answered, its answers are marked unavailable and Escape does nothing until its owner removes it. A dialog must always be leavable, so an answer to a rejoin request that could not be sent offers the question again, with its answers and Escape available; and the request clears when the connection drops, since the referee drops it then too. Otherwise the request stays open until the referee clears it or it expires. A warning icon sits on the first line of a title that wraps. In the delete dialogs the seat-token warning describes "Export backup first". Resign is a destructive question. The game menu and the log and rules sheet use the same surface and type; the menu items are stacked full-width buttons and the sheet headings are panel labels. Banners (connection, app update) are slim strips right under the bar, outside the scrolling body: an icon, the text and an action where there is one (a banner without one has no actions row, and a wrapped actions row keeps the strip under 64 px); being connected takes no room. While any banner shows on a game screen the middle may scroll by as much as the banner takes; the bar, the banner and the phase bar stay. *(Task 13)* "Your opponent didn't reconnect in time." offers "Claim the win" and "Keep waiting" in its strip. The update banner announces a new version once: on later screens it shows it without announcing it again. Opening a sheet forgets a focus change missed while an earlier dialog was open, so closing the sheet gives focus back to ☰ or ≡ unless the phase changed while the sheet was open.
5. **Plan:**
   - Tap a character to see its card detail and legal targets. *(superseded by the layout pass: the chosen hand card shows its ability, and the targets are always shown)*
   - Tap targets: illegal ones are disabled, with the reason.
     - *(M4)* A target is enabled only when some plan in `legal` contains the current selection plus it. A disabled target's reason is the engine's `validatePlan` error for that selection, localised from `engine.ftl`.
   - A summary ("Knight → Wolfen + Fool") and Confirm (with an optional confirm dialog). *(superseded by the layout pass: the summary is the phase bar's instruction, then Seal plan)*
   - *(layout pass, 2026-11-24)* One screen: the opponent panel, the Targets panel (nine target cards, five then four), your hand as medium cards overlapping along the bottom with the chosen one raised, your markers, and the phase bar, whose instruction is the plan summary. It fits 360 × 640 with no scrolling. *(Task 13)* With larger text the cards grow, so the Targets panel holds as many to a row as fit (never more than five) and the middle scrolls, and the hand overlaps further rather than leave the screen (the last card shows whole).
     - Your hand: the 3–4 medium cards overlap by 30 px, centred at the bottom of the middle area. Tapping one chooses it (and clears the targets); tapping the chosen card again clears the choice, so the cards are toggle buttons (`aria-pressed`). The chosen card rises 14 px with the accent outline; the hand reserves that room, so the raised card and its outline stay clear of the Targets panel. The chosen card's own text is its ability, so there is no separate character list, "Your plan" panel or ability note.
     - Targets: a tap adds or removes a target only when `legal` allows it. A chosen target has the accent outline and a tick over its art. A target that can't be added is dimmed and struck through; its reason (from `validatePlan`, or "Choose a character first.") is announced with it and shown in a small bubble on keyboard focus or a tap. Cards in your hand carry the "In hand" pill.
     - The phase bar's instruction is the summary in rich text, with the names in bold ("**Knight** → **Wolfen** + **Fool**", "**Knight** → no targets", or "Choose a character" before one is chosen); screen readers hear the full plan ("Plan: Knight targeting the Wolfen and the Fool"). Then Seal plan, with the confirmation when that setting is on. While the summary is the instruction, the phase bar has no rules hint: while Rules hints is on, the plan's hint is shown in the seal confirmation and in the ≡ rules sheet instead.
     - Once my plan is sealed, the same Targets panel and hand stay, showing my sealed plan (the chosen card raised, its targets ticked), without actions.
     - Entering the table never focuses a card, so no large card opens by itself: the route's h1 takes focus, and the phase instruction takes it only once focus has been on the table.
6. **Reveal:**
   - Hourglass stepper with the live effective initiative.
   - The opponent's choice is shown when it arrives.
   - Potion target picker if I hold the Potion.
   - *(layout pass, Task 9)* The middle is the versus panel: the opponent's face-down card, "vs", then my card, with my plan as a caption under mine ("**Hunter** → **Wolf King**") and "Placed N Hourglasses" under theirs once they have. Cards are `medium` while Hourglasses are placed (`large` does not fit 360 × 640) and `target` during the Potion choice. The face-down card matches my card's size and is an image named "Your opponent's character, face down". *(Task 13)* When larger text makes the two medium cards wider than the panel (narrower than 15.5 rem), both are drawn at 80 %.
   - *(layout pass, Task 9)* "Spend Hourglasses" panel: the stepper (only legal values), "**Knight** initiative 3 → 2" aligned right, a 0–8 track with ▲ at my effective initiative (decoration; a status line reads the same to screen readers), and a note: "Lower initiative resolves first." plus the room's tiebreak. The phase bar asks only "How many Hourglasses will you place?" with no rules hint, since the panel shows the rule. The stepper's value is not a live region here; the effective-initiative status line is the one announcement per step. The value uses the body font with tabular figures, so 0 never reads as the letter O.
   - *(layout pass, Task 9)* The Potion picker is a panel of `target` cards, five to a row (fewer when larger text makes them wider); its heading is for screen readers only, since the phase bar's instruction says the same.
7. **Showdown:** an ordered resolution list that animates one step at a time (or appears instantly with reduced motion), with plain-language results. Hunter prompt inline.
   - *(M4)* One step per resolution: the Potion, each character that resolves, then the round or game end. Speed comes from the Showdown speed setting (`step`: a "Next result" button; `auto`: one step every 1.2 s; `instant`). Reduced motion makes `auto` instant; `step` stays as chosen.
   - *(M4)* The Hunter prompt appears once the steps so far are shown. Stepping is display only: "Next round" is never held back by it.
   - *(M4)* The list is not a live region. Results are read out once, as they arrive, by the announcer log.
   - *(layout pass, Task 9)* From the Hunter choice to round over the middle holds, in order: the two plan panels side by side (opponent, then me; a `target` card, "**Mika**: **Wolfen** → **Knight**" and the order from `plans_revealed` on two lines of its own, "First" then "Initiative 3 → 2" *(Task 14; was "First · initiative 3 → 2")*), then the results list. *(Task 14 follow-up)* Neither order line ever wraps: when the two panels cannot both hold them whole, or the panels are narrower than 18 rem (larger text), the panels go one per row with their cards drawn at 75 %, and the middle may scroll above 100 % text. Health is shown only in the strips, so no status text repeats them (mockup 5's health panel is left out on purpose). The plan panels replace the separate "Showdown order" panel and the "Potion target" line (the Potion's step says where it went). Side by side rather than stacked as in mockup 5, so the list keeps room at 360 × 640.
   - *(layout pass, Task 9)* Each result is a row with a badge (the Potion, or the character's effective initiative). Earlier results are dimmed with the muted ink, which keeps 4.5:1 in every theme, for the row and every word and chip inside it, never by opacity (`done`), the latest has the accent outline (`now`), and a character eliminated before it could act gets its own struck-through line (`out`, "Your opponent's Wolfen is eliminated and doesn't act."), placed where it would have acted and shown with the step that eliminated it. When the screen runs out of room, the earlier results collapse to one line each (ellipsis; the full text stays in the log) and stay collapsed for the rest of the round, so the screen never scrolls.
   - *(M4)* **Game menu** on the table: "Pause after this round" (left out until pausing exists), "Continue on another device" (online: code, PIN behind a button, and a QR of the rejoin link that never holds the PIN), "Describe table" and Resign (with confirmation, local and online). *(Task 14)* The unofficial notice under the items is centred. With Haptics on, the device vibrates for 30 ms whenever this seat is offered a command after having none.
8. **Round summary** (at round over, the showdown's last result) and **Game over:** result, how it was won, "View replay", "Rematch" (same room, Badge to the loser).
   - *(M4, superseded for round over by Task 9 below)* The round summary is a closed `<details>` listing the round's events, from its start to `RoundEnded` (or `GameOver`), shown at round over and game over. *(layout pass)* When the round ended normally it closes with the card set aside: "Set aside this round: **Seer**". *(Task 14: now "Set aside: **Seer**")*
   - *(layout pass, Task 9)* At round over the round summary is the showdown's last result: the step for `RoundEnded` is drawn as a "Round N summary" panel (the latest result, with the accent outline) holding the card set aside as a `target` card with "Set aside: **Seer**" *(Task 14; the log keeps "The card set aside in round N was…")*, and the Badge passing ("**Your opponent** takes the ★ **Badge** for round 2."). The round's results above it are all `done` and collapse when there is no room. While it is shown the phase bar says "The round is over." without the rules hint, since the summary already says who takes the Badge. The full event list is in the ≡ log. *(Task 10: superseded at game over, see below.)*
   - *(layout pass, Task 9)* While paused, the pause panel stands alone in the middle, so the phase bar offers only Resume. Rematch shows the opponent's readiness and stays in place, marked unavailable, once asked. Pause and resume are online only: a local room lives in the host page, so local games offer Rematch but not pausing.
   - *(M4)* The pause panel answers the opponent's request ("Agree to pause", "Keep playing"), says "Pause agreed: applies at the end of the round" once agreed, and while paused shows "Game paused" with Resume and the opponent's readiness. A paused session's save is kept in its session record and Home lists it as "Paused". When its room is gone (`unknown_room`, or `room_closed`), the join screen offers "Resume from save": `POST /rooms {save, seat, grace_minutes: 10}`, then the old session is marked `resumedAs: NEW` on this device and the new room opens (`#/join/NEW?seat=…`) with `hello.seat` and an invite, worded for a paused game, until the opponent joins. Once the new room's welcome is stored, only the session on the same server whose `resumedAs` names that room is deleted; nothing in the link can name a session to delete. A tab closed in between keeps the old session and its save, and Home's Continue for it opens the new room. Saves carry the current game's own config, so a save taken during a rematch resumes too.
   - *(layout pass, Task 10)* **Game over** is a screen of its own (mockup 6), which fits 360 × 640 with no scrolling. A game seen ending live in a showdown first shows that showdown on the table as usual (plan panels, results, "Next result" in the phase bar; the bar reads "Round N · Showdown" and the phase bar "Showdown" with "The last round's results are in.", a line given only for a game won in a showdown, never after a resignation); once every result is shown, or at once after a resignation or a claimed win, the table becomes the Game over screen and focus moves to its result. A reload, Home → Continue or a rejoin of a game that was already over opens Game over directly, without stepping its showdown again. The bar has ← and the title "Game over"; ≡ stays on the right, since a local game has no replay and the log is its only record (mockup 6 leaves the right empty). There is no phase bar and no strips. In order: a centred result panel with the big line ("You win!" or "You lose.", Marcellus), how it was won in muted text ("**Mika** ran out of ♥ **Health** in round 6.", "**You** collected enough Fangs…", "**Mika** resigned…"; the opponent is "Your opponent" when unnamed), my Health, Cross and Fang; then "View replay" (primary) and "Rematch" side by side, each left out while not offered; then the rematch status in small muted text (with the waiting spinner once this seat has asked); *(Task 14: the replay check line and the rematch hint are gone)* then a History panel (left out until a game is recorded) with the totals row and the three latest games. The round summary is not shown at game over: the final results are stepped through before it, and the replay and the log keep them.
   - *(layout pass, Task 10)* History rows (on Game over and History): "**Won** vs Mika" (a short label, not a sentence: the result is the row's own emphasis, then the shared "vs" and the name), then "22 Nov 2026 · 6 rounds · Health" in muted text, and a `small` Replay link on the right whose accessible name is the full sentence ("Replay: Won against Mika, 22 Nov 2026, 6 rounds, Health"). The totals row reads "Played 14  Won 9 … Health 5 · Fangs 1 · Crosses 3" (wins by condition, from the result stored with each game; resignations are counted in Won only), each number bold, each condition read as "Won by Health".
   - *(M4)* At game over an online game is written to `history` once, keyed by server, room and game index, and `requestPersistence` sets `firstGameFinished`. Local games are not recorded.
9. **History** list, **Replay** viewer, **Stats**.
   - *(layout pass, Task 10)* **History:** a `small` "Stats" link at the top, then one panel holding the totals row and a row for every game, newest first. **Stats:** each part is a panel with a label heading (Overall, Results by win condition, Characters picked, Results by opponent).
   - *(layout pass, Task 10)* **Replay** is a game screen and fits 360 × 640 with no scrolling. The bar has ← and "Replay". The body holds: a stretched segmented control (My view / Full); the opponent strip at that step (without a connection, which a replay does not have); the middle; my strip; and the step's log in rich text, under its label. The log takes the room that is left and is the only part that may scroll, inside its panel (a focusable region), so everything else fits 360 × 640 and 390 × 844 at every step; the gallery's `replay-hunter` entry (a Hunter's attack that eliminates a character) is the longest step under test, and `replay-long-log` (the full view's first step) has more log than room, so it proves the log scrolls inside itself. The footer holds ⏮ (previous round), ◀ (previous step), "Step 12 of 40, round 3", ▶ (next step) and ⏭ (next round); the arrow keys still step. Before a showdown the middle is a Hands panel: each seat's hand as `target` cards, or "4 cards, hidden". From a showdown to round over it holds the table's plan panels and the whole results list (no stepping, so no "Next result"), then the hands as names only while either hand still holds cards. The log leaves out what those panels already show (the reveal and the results), so it lists the command and the other events of the step; when that leaves nothing it says "What happened is shown above." The old "In play" panel and initiative track are gone from the replay too.

10. **How to play:** rewritten rulebook, character reference, 5-step interactive tutorial (scripted local game via the memory referee).
11. **Settings**, plus **Backup** (export/import).

**Deduction tracker:**
- *(layout pass, 2026-11-24)* The deduction tracker is now only the "In hand" mark: in the Targets panel, every target card whose character is in my hand shows the "In hand" pill, computed from my hand and always on. There are no manual marks, no "ruled out" state and no setting.
- *(M4, superseded by the layout pass)* My 9 target cards doubled as a tracker, each marked mine (auto), possible or ruled out, with an auto-mark setting.
- *(M4; replaced by the plan panels on the table in Task 9 and in the replay in Task 10)* The initiative track shows the effective initiatives the engine sent in `plans_revealed`. They stay unchanged through round over, even though the placed Hourglasses have gone back to the supply by then.

### 8.2 Settings
*(layout pass, 2026-11-24)* "Deduction auto-mark" is removed; a stored `deductionAutoMark` key is ignored and dropped when settings are next saved.

| Group | Settings |
|---|---|
| General | Language: a dropdown, each language named in itself ("System (English)", "English", "Deutsch", "日本語"), so more can be added; Theme (System/Light/Dark); Display name; Install app (see §7) |
| Reading & accessibility | Text size (90% / 100% / 125% / 150%); Reading font (Default / Lexend / OpenDyslexic); Extra letter and line spacing; Card text: icons + text / text only; High contrast (on/off, applies to light and dark); Colour-blind patterns on/off (shapes are always on); Reduced motion (System/On/Off); Showdown speed (Step-by-step tap / Auto / Instant); Haptics on my turn |
| Gameplay | Confirm before submitting plan; Rules hints; *(M5)* Warn on pointless targets; *(M5)* Hunter: always ask / auto when a target matches; *(M5)* Tutorial tips |
| Network | Server: a dropdown, Default / Custom… (Custom reveals the address field); *(M5)* Data saver (no avatars, no prefetch) |
| Data | A note that data is stored only on this device; Backup (export / import); Clear history; Delete all data (both with confirmation, see §7) |
| About | "Version x.y.z", links to the About screen's credits and licences, "© 2026 David F Dev" |

*(M4)* The settings marked M5 need rules reasoning the engine doesn't expose yet, or have nothing to act on yet (there are no avatars or prefetching for Data saver), so M4 leaves them out. M4 offers English only: the Language dropdown lists "System (English)" and "English" until DE and JA arrive in M5.

*(layout pass, 2026-11-24, mockups 7 and 8)* Each group is a panel with an uppercase label, and each setting a row with its name on the left and its control on the right; the rows are 44 px tall for the touch targets. Reading and Accessibility are one group. **Text size** is four presets, 90%, 100%, 125% and 150%, in place of the 10% steps from 90 to 150: a stored size between presets (from the old steps, a backup or another device) moves to the nearest preset, the smaller on a tie, when the settings are read. On touch screens (`pointer: coarse`) the text fields and dropdowns draw their text at 16 px or more, so mobile browsers don't zoom into them on focus; with a mouse they keep the mockup's smaller size.

*(layout pass, Task 13)* The settings as shown, in order: **General**: Language, Theme (System / Light / Dark), Display name (with its hint), Install app (an Install button; on iOS Safari the steps "Tap the share button, then “Add to Home Screen”." aligned to the right; "Installed" once installed; the row is left out where the browser cannot install). **Reading & accessibility**: Text size, Reading font (Default / Lexend / OpenDyslexic), Extra letter and line spacing, Card text (Icons and text / Text only), High contrast, Colour-blind patterns, Reduced motion (System / On / Off), Showdown speed (Step by step / Auto / Instant), Vibrate on my turn. **Gameplay**: Confirm before sealing a plan, Rules hints. **Network**: Server (Default / Custom…, which reveals "Server address" and "Use this server"). **Data**: the note, Backup (Export, Import), Match history (Clear history), Everything on this device (Delete all data). **About**: the version with Credits and Licences, and the copyright. Switches show ON or OFF beside them.

*(M4 final review)* **System preferences follow the OS live:** Theme "System" and Reduced motion "System" follow the operating system while the app is open. The app listens for `change` on the `prefers-color-scheme` and `prefers-reduced-motion` media queries and re-applies the current settings, so the theme, the `data-motion` attribute and the showdown's instant mode switch without a reload.

### 8.3 Visual language & assets
- **Placeholder theme:** the default.
  - Each character is a glyph on a rounded card (see "Card anatomy" below).
  - **Faction carried by icon and pattern, not colour alone** *(revised 2026-11-24, Task 5A)*: the faction icon (shield for Human, claws for Werewolf) at the top right, and the art panel's pattern: hatched for Werewolves, tinted for Humans, always on. The colour-blind patterns setting strengthens the hatch.
  - **Marker icons:** our own simple SVG shapes in the placeholder pack *(owner decision, M4)*. A free pack such as Kenney Board Game Icons (CC0) may replace them later through a theme pack, with credits shown.
  - **Initiative** is always shown as a number in a fixed corner (see "Card anatomy").
  - **Card anatomy** *(layout pass, revised 2026-11-24; design note `2026-11-24-cards-plan-home-design.md`, visual reference `docs/mockups/cards-and-plan.html` sections H and I)*: one rounded parchment card shape at three sizes, drawn in rem so it grows with the text size: **large** 120 × 176 px (inspect, reveal), **medium** 98 × 146 px (hand) and **target** 58 × 84 px. Top row: initiative at the top left (the same size as the name; the Fool shows "–"), the name centred, the faction icon at the top right (shield for Human, claw for Werewolf; the Fool has none). Then the art panel, a fixed height at each size whatever the ability (Werewolves hatched, Humans tinted), then the ability pills, then the ability text in our own words (large and medium only). The name is always one line (10 px on medium cards); on target cards the name takes the whole top row and the initiative and faction icon sit in the art panel's top corners. Pills always sit on one row. Neither names nor pills ever wrap or overflow at any size. *(Task 5A)* The card text is its own short message per card (`card-text-*`, with marker arguments so it carries tokens), as the accessible-name ability text (`card-ability-*`) is too long for a medium card; every word it draws also appears in the card's accessible name. *(Task 11)* `card-ability-*` takes the same marker arguments, so How to play (the ability legend first, then each character as a row: its medium card and its full ability in rich text) draws each named marker as a token. In How to play the card is a decorative picture (`aria-hidden`, not a button, not focusable, no popover); the row reads the name, initiative and faction (`card-character`, the name in bold), then the ability, so the ability is exposed once. Medium card text is 9 px with line height 1.1, so the longest (the Wolfen's) fits in four lines.
  - **Ability pills** *(layout pass, revised 2026-11-24)*: drawn from `ability_summary`, in resolution order. A **gain** is the marker token alone with a green ring (no pill, no "+"). An **attack** is a red-tinted, red-outlined pill: when it has a cost, the spent marker's token then ▶; then one faction shape per target (both shapes, "shield / claw", for any character); then a colon and hearts when a hit costs more than 1 Health. With `PerExtraTarget` (the Wolf King), the attack is two pills: the first target, then "Fang ▶ shield" for each further one, with no repeat mark. `optional_cross` is not drawn: whether to spend is part of every spend. Gains and attacks differ by shape (circle versus pill), not only by colour. The pills are decorative (`aria-hidden`); the card's accessible name says the ability and is unchanged. Glyphs, faction, marker and ability icons are one inline SVG sprite of `<symbol>`s drawn with `<use>` in `currentColor`, so they follow forced colours. "Text only" card text hides the glyph and the pills.
  - **Marker tokens** *(layout pass, revised 2026-11-24)*: every marker (Cross, Fang, Hourglass, Potion) is drawn on a round neutral token wherever it appears: pills, card text, marker counts, game text and the legend. Hearts (Health) and the Badge stay bare. In text the token sits directly before the marker's bold name ("Gain a [token] **Cross**.").
  - **Target cards** *(layout pass, revised 2026-11-24)*: the nine targets are target-size cards with pills and no text. A card in your hand shows a neutral "In hand" pill in place of its ability pills. Keyboard focus (`:focus-visible`, never a focus caused by a tap) or a 500 ms press on any card shows it at large size in a non-modal popover (top layer, kept inside the viewport). Escape, blur or a tap elsewhere closes it; a normal tap only chooses the card. The popover is `aria-hidden`, as the card's accessible name carries everything it shows.
  - **Ability legend** *(layout pass, revised 2026-11-24)*: "How to read abilities" (gain, attack and the target shapes, extra damage, spend) appears in How to play and in the in-game rules sheet. *(Task 14)* Each sample is centred on the first line of its text.
- **Theme packs:**
  - Location: `themes/<id>/theme.json`.
  - Contents: `cards` and `markers` maps from engine IDs to SVG files, `factions` (human, werewolf) and `abilities` icon maps *(layout pass; revised 2026-11-24: `abilities` holds only `spend`, the ▶ between a spent marker and its targets)*, credits, licence. The placeholder pack's colour, radius and font tokens live in the app stylesheet; per-pack tokens are deferred until a second pack ships.
  - Missing entries fall back to the placeholder theme.
- **The Moonlit look** *(layout pass, Task 13)*: the screens follow the mockups (`docs/mockups/mockups.html`) and, for cards, the plan and Home, sections H and I of `docs/mockups/cards-and-plan.html`.
  - **Bar:** a night-blue gradient with the moon emblem and a Marcellus title; the bar and a static, decorative treeline (`aria-hidden`) at the foot of the body are the only scenery.
  - **Panels:** parchment surfaces with a 12 px radius and a hairline border; a panel's label is small uppercase Marcellus, letter-spaced, in the muted ink. Dense game screens use the tight panel and a 6 px gap between panels; other screens 10 px.
  - **Buttons:** one kit style (`kit-button`), also worn by controls that are not buttons, such as a disclosure's summary. Each screen or dialog has at most one primary (filled accent) action; destructive actions are outlined or filled in the danger colour and always carry the warning icon. Full-width block buttons stack; `small` buttons sit inline (Replay links, banner actions). The bar's icon buttons are 32 px squares with 44 px hit areas.
  - **Chips** hold short states (plan status, the Badge, the room's rules).
  - **Marker rows** *(Task 14)*: the bare Heart and star are drawn centred in their art, so in a row of markers (the strips, the Game over result) they sit at the height of the round tokens beside them, within 1 px at any text size: each item of a marker row (a count, a token, the Badge chip) is centred on the row geometrically, not on the text's capitals.
  - **Waiting** *(Task 14, owner 2026-11-25)*: wherever the app waits on another person or the network, a small spinner (decorative, hidden from screen readers; one turn every 0.9 s) follows the waiting text: "Waiting for your opponent." in the phase bar, the connecting and reconnecting banner and the opponent's reconnect countdown, the invite, host and local join status panels (where it leads, in place of the status dot), Seal plan and Place N Hourglasses once sent, "Creating the game", "Creating a room from the save", the rematch, pause and resume requests, and a rejoin awaiting the opponent's approval. Under reduced motion it is a steady dot. *(Task 14 fix round 1)* It shows only while this seat is waiting with nothing to do: the phase bar shows none while it offers an action (such as Resume while paused, where the pause panel's own status carries the one spinner once Resume is pressed), and a status panel shows none once its wait has ended without arriving (Disconnected, Could not join the room, Game over).
- **Text emphasis** *(layout pass, Task 13)*: in game text, rich text bolds the words that stand for a player ("**Your opponent**", "**Mika**") and character names; every marker word is bold with its token (or bare heart or star) directly before it; history rows bold the result. Nothing else in a sentence is bold. Secondary text uses the muted ink, which keeps 4.5:1. Inline marker tokens sit centred on the capitals of the text around them (with the `cap` unit; without it, a −0.25em offset that keeps them within a tenth of the font size).
- **Palette:** Okabe–Ito-based. All text 4.5:1, UI elements 3:1, tested in light, dark and high-contrast themes.
  - *(M4)* Links are accent-coloured text, so `--accent` must reach 4.5:1 on the page background and on panels as well as on cards. The light theme's accent is therefore `#0068a3`, a darker shade of the Okabe–Ito blue. The Human faction colour stays `#0072b2`.

### 8.4 Localisation & fonts
- **Fluent `.ftl` files:**
  - Shared by the CLI (fluent-rs) and the web app (@fluent/bundle).
  - One folder per locale; the rulebook as localised Markdown.
  - Pseudo-locale in CI to catch truncation.
  - German is designed for ~30% expansion.
  - Japanese uses `lang="ja"`, `word-break: auto-phrase`, and line-height 1.7.
- **Event messages and perspective:**
  - Event messages take each seat argument as a perspective selector (`you`, `opponent`, `p0`, `p1`) plus a display name for `p0`/`p1`, and select their own grammatical variants (subject, possessive, object, verb agreement). Concatenating pronouns in code is not allowed.
  - Seats are shown as "Player 1" and "Player 2".
  - Every character name stands next to its owner's seat phrase ("Your **Knight** hits your opponent's **Wolfen**"). A generated test renders every event of fuzzed games from p0, p1 and no perspective and checks each character against its owner.
  - Words that stand for a player are bold like "Player 1" *(owner decision 10, 2026-11-24)*: the you/opponent variants take the `youCap`, `you`, `yourCap`, `your`, `opponentCap` and `opponent` arguments (messages `player-you-cap` …), marked as players. Other sentence words are never bold.
  - Marker names in event text, including the forfeit reasons and the game-over line (Badge, Potion, Health, counted Hourglasses, Crosses and Fangs), are arguments, not literal words, so rich text can put the marker icon before them. The client declares, per message, which arguments are player names, character names and markers; selector and plural arguments are never marked. A list or plan argument is itself rich (`{ parts }`, built with `Intl.ListFormat.formatToParts`), so its names are emphasised from their own arguments, never by matching the rendered text. Plan targets take the article ("targeting the Knight and the Fool").
  - Lists are joined with `Intl.ListFormat` in the web app and an equivalent in the CLI.
  - Grammatical case and gender of character names (needed for German) are deferred to M5, where character messages become parameterised.
- **Fonts** (OFL, self-hosted, subset at build time):

  | Role | Latin | Japanese |
  |---|---|---|
  | Body / UI / card text | Atkinson Hyperlegible Next | BIZ UDPGothic |
  | Headings / display (app title, bar titles, labels, panel and dialog titles, the big result line, display numbers) | Marcellus *(owner, 2026-11-24: Cinzel dropped)* | Shippori Mincho B1 |
  | Optional reading fonts | Lexend, OpenDyslexic | — |

### 8.5 Accessibility
- **WCAG 2.2 AA:**
  - 44 px targets; visible focus. *(Task 14)* A heading or line the app moves focus to (`tabindex="-1"`, on a new screen, phase, pause or result) shows no focus outline, since it is not a control; focus still moves there and every control keeps its visible focus.
  - Everything works by tap and keyboard, with no drag required.
  - Reflows at 320 px and at 200% text size.
- **Screen readers:**
  - Cards are `button`s with full accessible names, e.g. "3, Knight, Human. Gain an Hourglass, then attack a Werewolf." *(M4, WCAG 2.5.3 label in name)* The name begins with the card's visible text in the order it is drawn, the initiative and then the name, so a speech user can say what they see. The faction and ability follow. The Fool, which has no initiative, starts with "The Fool".
  - Opponent actions are announced through an `aria-live` log.
  - A "Describe table" command.
- **No time pressure by default.**

## 9. Performance, data & battery budgets
| Budget | Target |
|---|---|
| Initial load (excluding Japanese fonts) | ≤ 350 KB gzipped, of which engine WASM ≤ 150 KB |
| Repeat visits | Load from the service worker cache, with no network needed except the game socket |
| Idle CPU | No rAF loop. CSS transitions only (≤ 300 ms, disabled under reduced motion). Re-render only when the store changes |
| Network while hidden | 0 bytes: socket closed |
| Network while visible and idle | A ping every 30 s, about 25 KB/hour |

*(M4)* A unit test builds the app and checks the initial load: `index.html`, the entry JS and CSS with their static imports, the engine WebAssembly and the woff2 fonts the start-up CSS names, each gzipped at level 9. Lexend and OpenDyslexic are not part of it.

## 10. Testing & delivery

**Test tiers:**

| Tier | Tools | Scope |
|---|---|---|
| Engine | `cargo test`, proptest, `wwd fuzz` | Every rule in §5 as a named test; determinism (same seed + commands → same hash); redaction (no `View` for seat X ever contains Y's hidden data) |
| Referee | Vitest, memory adapter, fake clock | Join, seats, reconnect, grace, pause/resume, rate limits, redaction on the wire |
| Client | Vitest + Testing Library, in-memory transport | Components and stores |
| End-to-end | Playwright: `e2e` (local mode) and *(M3)* `e2e:online` vs the Node referee started in the test runner's process on localhost, with test overrides and a temporary data folder. *(M4)* That referee unloads a room after 1 s without connections, so a test can see a room leave memory, and takes a raised room-creation limit (`roomCreateLimit`, test overrides only), because one run creates about 32 rooms. *(M4)* `e2e:pwa` runs against a production build served by `vite preview` | Desktop Chrome and Pixel 7 emulation, as two projects of every config; later an Android emulator via Playwright `_android` or Appium (`10.0.2.2`). Two-browser-context games: a full game, going offline and back, a hidden tab reconnecting, PIN rejoin, approval rejoin, claim win after a short `test.grace_ms`, resign, invite links and an unknown room. *(M4)* Also: pause and resume across devices (agreed mid-round, both tabs closed and reopened from Home, the replay verifies with two segments); resume from a save after the room is gone (its file deleted and the room unloaded); rematch with the Badge to the loser; a finished game in history with its replay stepped; a backup exported and imported on a fresh context; and the app opening offline |
| Parity | *(M3)* `e2e:parity`: the tests tagged `@parity` vs `wrangler dev` (local workerd, no account) | Catches Cloudflare-specific differences, locally |
| Accessibility | axe-core in Playwright. *(M4)* `@axe-core/playwright` in `e2e:online` checks every screen: Home, Settings, About, How to play, New game, the name prompt, Invite, Join, the table at plan, plan confirmation, reveal, showdown and round over, the game menu, a pause request, Game over, Replay (my view and full), History and Stats. Each is checked in light, dark and high contrast (light and dark), and a serious or critical violation fails the run. No rule is turned off | Plus a manual screen-reader pass per milestone; the full audit is M5 |
| Staging | *(M3)* `scripts/smoke.mjs` after each deploy | The only tier touching Cloudflare: `/health`, one room, two players welcomed and sent the opening events, then one resigns so the room is kept only for the finished-room retention. Four requests, or up to seven when `/health` is retried after a fresh deploy; Node built-ins only, with a time limit and a bounded close. Its own test runs it against a Node referee on a free port |

**CI (GitHub Actions):**
- The `engine` workflow runs fmt, clippy, tests and fuzz.
- The `app` workflow builds the engine's WASM and the app, then runs lint, the unit tests (including the smoke script's test, a check that a sub-path build loads every asset, the manifest and the service worker scope from under its base, and *(M4)* the initial-load budget), `e2e`, *(M4)* `e2e:pwa` (a production build served by `vite preview`: after one visit the app opens offline and a local game starts) and `e2e:online`. `e2e:parity` runs only when the workflow is started by hand.
- *(M4)* The `app` workflow's `docker` job builds the `referee-node` image, runs it, smoke-tests it with `scripts/smoke.mjs` and shows the container logs if that fails, on every push and pull request that touches `app/`, `engine/`, `scripts/`, the `setup-app` action or `app.yml` (the workflow is path-filtered), and on a manual run.
- *(M3)* The `deploy` workflow runs on pushes to `main` and by hand. Each job runs only when its secrets and variables are set, so a fresh fork stays green, and each has least-privilege `permissions`.
  - `referee-staging` deploys with `--env staging`, then runs the smoke test. `referee-production` follows only if that passed, behind the `production` environment's required reviewers, and smoke-tests production. Both deploy through the package's `deploy:*` scripts, which refuse to run without a safe `ALLOWED_ORIGINS` list, with any `TEST_OVERRIDES` var, or with an `--env`, `-e`, `--name`, `--config` or `-c` option that would deploy another environment, Worker or config. Their tests run a stub named by `WWD_WRANGLER_BIN` (which no workflow sets) and assert the exact arguments handed to wrangler; the one test that runs the real wrangler uses `--dry-run`, with no Cloudflare credential variables and empty config directories, so it cannot authenticate.
  - `web` builds the app with `VITE_REFEREE_URL` from the `REFEREE_URL` variable and `BASE_PATH` from the Pages site, then publishes it with `actions/upload-pages-artifact` and `actions/deploy-pages`. When the referee is configured it waits for `referee-production` and runs only if that succeeded, so the site never goes live ahead of its referee.
  - Pushes that change only `docs/` or Markdown files don't trigger it. Every job has a timeout.
  - The referees' allowed origins come from the `APP_ORIGINS` variable (https origins only, never `*`), passed as `--var ALLOWED_ORIGINS`. Staging also allows `http://localhost:5173` and `http://localhost:4173`.
  - `docs/deploy.md` is the owner's guide: the Cloudflare token, the GitHub secrets, variables and environment, Pages, the optional custom domains, Docker self-hosting, and costs.

**Hosting:**

| Piece | Where |
|---|---|
| App | GitHub Pages at `https://werewolf-duel.davidfdev.com` (a custom domain: a CNAME to `<github-user>.github.io`, HTTPS enforced). The project site `https://<github-user>.github.io/<repo>/` also works without one |
| Referee | `https://wwd-referee.davidfdev.workers.dev`, with staging at `https://wwd-referee-staging.davidfdev.workers.dev`; optionally a custom subdomain if the DNS is on Cloudflare |
| Self-hosting | A Docker image of `referee-node`, behind a TLS reverse proxy. The server URL is embedded in the invite link (`#/join/CODE?server=URL`), or *(M4)* set in Settings |

## 11. Left to the builder
- Exact libraries inside the chosen stack (e.g. idb vs Dexie, the QR library, the WASM binding helpers).
- Visual details within the mockups' structure.
- Exact message field names.
- The resume-from-save trust rule: require both players' matching saves, or allow host upload in friend mode. *(M4: host upload, see §6.5.)*
- Join-code alphabet and length (≥ 6 characters, unambiguous), and storage schemas.
- Wording of rulebook and tutorial text, which should then be reviewed by the project owner.

## 12. Milestones
1. **M1 Engine:**
   - The full rules in §5, CLI, fuzzing, replay/verify, unsafe edits.
   - An engine-test table mapping every rule and FAQ point to a test.
2. **M2 Local loop:**
   - `client-core`, `referee-core` and the memory adapter.
   - A playable but unstyled web table against a local referee in one browser (two tabs).
3. **M3 Online:**
   - Node referee and Cloudflare referee.
   - Join codes, reconnection, the mobile lifecycle.
   - Deployed to GitHub Pages + Workers.
4. **M4 Product** *(done)*:
   - All screens as mocked, settings, saves/pause, history/replay/stats, backup.
   - PWA install and offline shell.
   - Moved to M5: DE and JA with their fonts; the pseudo-locale CI check; the full accessibility audit; the rewritten rulebook and the tutorial (M4's "How to play" is the character reference); the gameplay settings that need rules help from the engine ("Warn on pointless targets", "Hunter: auto when a target matches", "Tutorial tips"); and "Data saver".
   - **Accepted residual risks** at the end of M4:
     - Resuming from a save trusts the uploader, because a single verified upload is enough (§6.5). A rule-valid replay made from seeds of their choosing also verifies. This is acceptable for friend games; public play would need both players' saves or saves signed by the server.
     - The joining player is shown the restored round and markers before pressing Resume. Their resume request is their consent to the uploaded state.
     - Delete all data doesn't reset the app's other open tabs (§7).

   **M4 decisions** (from the M4 plan):

   | Topic | Decision |
   |---|---|
   | Protocol version | `PROTOCOL_VERSION` is **2**. The app is deployed, so an old cached page gets `protocol_version` and the existing "reload" message |
   | Protocol version *(layout pass)* | `PROTOCOL_VERSION` is **3**: events changed shape (`AttackHit.attacker`, `AttackMissed.attacker`, `DiscardRevealed`), so a cached v2 page gets `protocol_version` and the reload prompt instead of failing on unknown events |
   | When a pause applies | At the **first round boundary** after both seats agree (`Phase::RoundOver` with neither seat ready). Agreed during a round, it waits for the round's end. Agreed in `RoundOver` after one seat already chose "Next round", it applies at the next round's end |
   | Resume | A paused room resumes only when both seats are connected **and** both have sent `resume_request`. Connecting alone never resumes |
   | Resume from a save file | Friend mode: **one verified upload** (§11). `POST /rooms` with the save and the uploader's seat. The referee verifies the replay, refuses a tainted one, and checks that the boundary is where the replay ends |
   | Rematch | Same room. Both seats send `rematch_request`; the new game has a fresh seed and `badge_start: Seat(loser)`. Each game in a room has an index, and sequence numbers restart at 0 for each game |
   | PIN lockout over a room's life | Each lockout doubles the lock: 15 min, 30 min, 1 h … capped at 24 h. The count resets on a successful PIN rejoin. About 230 attempts fit in 30 days, not 17 000 |
   | Node memory | A room with no connections is written and dropped from memory after `IDLE_UNLOAD_MS` (10 min); it reloads lazily |
   | Docker | Built and smoke-tested in CI (the `docker` job), since there is no Docker on the development machine |
   | Storage | IndexedDB via `idb`. M3's `localStorage` sessions are migrated once, then removed |
   | Icons | Our own SVGs for characters (shape + pattern + glyph + number) and markers |
   | Fonts | Self-hosted `@fontsource` packages, Latin subsets only. Body and headings load at start; Lexend and OpenDyslexic load only when chosen. OpenDyslexic comes from `@fontsource/opendyslexic` |
5. **M5 Reach:**
   - DE and JA, the accessibility pass, the rewritten rulebook, the tutorial.
6. **Later:**
   - LAN host mode, pass-and-play, bot, public matchmaking (accounts, timers, abandon = loss, ratings).
   - Capacitor/Tauri packages, fair-play peer mode, real art.
