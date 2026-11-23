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
- Hidden information reaches the opponent's device: their hand, their plan before the reveal, or the discarded card.
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
- Discard 1 face-down. It is hidden from both players.
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
  apps/web                    Svelte 5 + Vite SPA (plain Vite, not SvelteKit); PWA features arrive later
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
- Examples: `HandDealt` (Seat), `PlanSubmitted{target_count}` (Public), `PlansRevealed`, `CharacterEliminated`, `MarkersChanged`, `GameOver`.
- `view()` and the per-seat event filter are the *only* way data leaves the engine for a player.

**Determinism:**
- ChaCha8 RNG whose state is part of `State`.
- `BTreeMap`/`Vec` only; no floats, clock or locale.
- Canonical serialisation (postcard) for hashing.
- `engine_version` is included in hashes and replays.

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
- *(M3)* `claim_win`, after the opponent's grace window has expired.
- `ping`.

**Referee → client:**
- `welcome{seat, seat_token, room, config, pin}`. *(M3)* `pin` is the seat's 4-digit PIN, shown under "Continue on another device".
- `waiting`, sent to a connection while the opponent seat is still empty.
- `events{from_seq, events[], view, legal, pending}`.
- *(M3)* `opponent_status{connected, name?, grace_deadline?, grace_remaining_ms?, can_claim_win?, pin_attempt_failed?}`.
  - `grace_remaining_ms` is computed by the referee whenever `grace_deadline` is sent. Clients time the countdown from its arrival plus the remaining time, never from the absolute deadline, so clock skew between devices does not matter.
  - `can_claim_win: true` replaces `grace_deadline` once the window has passed.
  - `pin_attempt_failed: true` tells a player that someone just entered a wrong PIN for the opponent's seat.
- *(M3)* `rejoin_pending` to the device asking for a seat without a PIN, and `rejoin_request{deadline, remaining_ms}` to the opponent asked to approve it.
  - `deadline` is epoch ms by the referee's clock and is informational. Clients time the request from its arrival plus `remaining_ms`.
  - If the approver's seat is taken over by a new connection (`hello` with its token, or `rebind`) while the request is open, the request is sent again to the new connection, with a fresh `remaining_ms`.
- *(M3)* `rejoin_withdrawn` to that approver when the request is no longer open: it expired, its seat was reclaimed by token or PIN, or the asking connection closed. The approver's dialog also closes itself at `deadline` as a fallback.
- *(M4)* `paused{save}`.
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
- **Sequence numbers are game-wide:** `seq = segment_base + log_index`. `segment_base` is 0 for the first segment; later segments add the previous segments' log lengths.
- **Limits:** `MAX_MESSAGE_BYTES` (8192) is enforced on client → referee messages only; the referee is trusted, so server messages have no cap. Each connection may send 30 messages per rolling 10 s; the excess is dropped with `error{rate_limited}`.
- `events` always carries the full redacted `view`, so a client that misses anything self-heals.
- Typical message: 100–400 bytes. A game is roughly 10–40 KB.

**HTTP API** *(M3)*, identical on both network adapters and implemented once in `referee-service`:
- `POST /rooms` with JSON `{config: RulesConfig, grace_minutes: 5|10|30, test?: {grace_ms?, seed?}}` returns `201 {code}`.
  - A disallowed `Origin` gets `403 {error: "forbidden_origin"}` before the rate limit or the body is checked, and isn't counted.
  - The body is capped at `MAX_MESSAGE_BYTES` (`413 {error: "too_large"}`) and validated strictly (`400 {error: "invalid_message"}`).
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
    - PIN attempts are rate-limited. *(M3)* Up to `PIN_MAX_FAILURES` (5) wrong attempts within `PIN_LOCK_MS` (15 min) get `wrong_pin`. The next wrong one, the 6th, is itself answered `pin_locked` and locks that seat's PIN for 15 minutes; while it is locked, every attempt, even with the right PIN, gets `pin_locked`. Each wrong attempt sends the connected opponent `opponent_status` with `pin_attempt_failed: true`. The failures and the lock are part of the snapshot, so they survive a restore.
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
  - **Resuming from a save file:**
    - Used if the room has expired, or the players move to another server.
    - Either player creates a room from the save. The referee accepts it when both players present matching save hashes, or with a host-confirmed single upload in friend mode (builder's choice: see §11). It verifies the replay first.
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
  - **Notes for M4** (from the M3 final review):
    - **Unload idle rooms on Node.** `referee-node` keeps every room it has touched in memory until the sweep deletes it. Unload a room that has no connections and has been idle for a while; it reloads lazily from its file.
    - **Bound PIN attempts over a room's lifetime.** The lockout allows six wrong PINs per 15-minute lock, so about 17 000 attempts over a room's 30 idle days against only 10⁴ PINs. Consider a lock that escalates with each lockout, or a cap on wrong attempts per seat.
    - **Build the Docker image once** before advertising self-hosting; it has never been built.
- **Retention:**
  - Room data is deleted 24 h after a game ends (`FINISHED_ROOM_TTL_MS`).
  - Idle unfinished or paused rooms are deleted after 30 days without activity (`IDLE_ROOM_TTL_MS`).
  - *(M3)* The connected sockets of an expiring room are sent `error{room_closed}` and closed. `isExpired()` in `referee-service` decides expiry for both adapters.
  - Saves also live on the clients.
- **Abuse limits (cheap, from day one):** a message size cap (8 KiB per message, 16 KiB per frame), a per-connection rate limit (30 messages per 10 s), and a cap on room creation per IP per hour (20, adapter-level).
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
- **The Node adapter** (`referee-node`) uses `ws`. Rooms live in memory and in `<data>/<CODE>.json`, loaded lazily. Snapshot files, which hold seat tokens and PINs, and their temporary files are created with mode `0600`. It closes a socket with 1013 when more than 1 MiB of output is unread. With `--trust-proxy` it rate-limits by the last `X-Forwarded-For` hop. Its Docker image is the self-hosting option.
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
  - `replayVerified` is set at game over and is true only when the replay's commitment matches the one announced in `game_started`, the replay's config equals the announced config, and the events rebuilt from the replay equal the events received.
  - The UI is a pure function of the store.
  - The UI only offers actions from `legal`. Invalid actions can't be expressed.
- **Mobile lifecycle** *(M3: `ConnectionManager` with `browserLifecycle()`)*:
  - On `visibilitychange` → hidden: close the socket. No heartbeats while hidden.
  - On visible, on `pageshow` with `persisted: true` (back/forward cache) and on `online`: open a fresh connection and resume with `last_seq`, so no event is applied twice.
  - A new connection must open within `CONNECT_TIMEOUT_MS` (10 s). Once open it is pinged and must answer within `PONG_TIMEOUT_MS` (3 s).
  - While visible, ping every `PING_INTERVAL_MS` (30 s); each ping must be answered before the next one is due.
  - Watchdog: if a ping goes unanswered, or the ping timer fires more than `TIMER_JUMP_MS` (10 s) late (the device was suspended), reconnect.
  - A lost connection is retried after 0.5 s, 1 s, 2 s, 4 s, 8 s and then every 15 s, each delay scaled by a random ±20 %. The backoff resets only once a connection has answered a ping, so a referee that welcomes and then drops connections can't cause a reconnect storm.
  - Reconnecting stops at game over, on rejection, or after a closing error code, and `stopReason` says which. `start()` after `stop()` clears it and connects again, for a fresh attempt such as joining as a new player.
  - The store's connection `phase` is `online`, `connecting`, `offline` or `hidden`, with the retry count and when the next retry is due, for the connection banner.
- **Dev agent hook** (dev builds only):
  - `window.__wwd = { state(), legal(), act(cmd), describe() }`
  - `describe()` returns the same text as the screen-reader "describe table".

## 7. Data on the device

- **IndexedDB** (via `idb`) holds:
  - `settings`
  - `identity` (display name, generated device id)
  - `sessions` (active and paused: room, seat token, server URL, save, timestamps)
  - `history` (completed games: full log after the game, result, metadata)
- Call `navigator.storage.persist()`.
- **Where data lives:** everything above is stored only on the device, in the browser's IndexedDB for the app's origin. There are no accounts. The referee holds only the live room (display names, seat tokens, the game in progress) until its retention expires (§6.5), and an opponent's device keeps its own history of shared games.
- **Clear history** deletes `history` only. **Delete all data** deletes every store (settings, identity, sessions, history) and returns the app to its first-run state. Both need a confirmation dialog that names exactly what will be deleted, warns that paused and active games can't be resumed afterwards, offers "Export backup first", and states that it affects this device only (opponents keep their copies, and online rooms expire on their own). Destructive buttons carry a warning icon as well as colour.
- **Installing the app (PWA):**
  - Settings → General has an **Install app** row. It shows an Install button where the browser provides an install prompt (`beforeinstallprompt`: Chrome and Edge on desktop and Android); the Share → "Add to Home Screen" steps on iOS Safari; "Installed" when running in `display-mode: standalone`; and is hidden where installing is impossible (e.g. Firefox desktop).
  - Home shows a dismissible **Install the app** card **once**, after the first finished game, never on a first visit. Dismissing it hides it for good (remembered in settings).
  - On iOS the card's text mentions keeping saved games safe, because Safari may evict storage for sites not visited for 7 days unless the app is installed.
- **History stats:**
  - win/loss by win condition (health / fangs / crosses);
  - character pick frequency and success rate;
  - average rounds per game;
  - the opponent's display name.
- **Replay viewer:** step by round and phase. Show "my view" or "full" (the full log is shared by the referee after the game ends).
- **Backup file** `werewolf-duel-backup-YYYYMMDD.wwdb`:
  - gzip JSON: `{format_version, exported_at, settings, identity, sessions, history, checksum}`.
  - Export via the save-file picker, a download, or the share sheet.
  - Import shows a preview and then merges by ID.
- **Schema versioning:** `format_version` and ordered migrations for saves, history and backups. Replays re-simulate using the recorded `engine_version`. The engine package keeps the old rules modules needed for that.

## 8. User experience

### 8.1 Screens (see mockups)
1. **Home**
   - Continue (active or paused sessions), New game, Join game, How to play, History, Settings.
   - The one-time, dismissible **Install the app** card (see §7) sits below the main buttons when shown.
   - Footer, four short lines: "Made by David F Dev"; "An unofficial digital version of Werewolf: Duel!"; "Not affiliated with Whales Entertainment."; and a link "Get the physical game ↗" to `https://boardgamegeek.com/boardgame/436306/werewolf-duel#buyacopy`, opening in a new tab (`rel="noopener noreferrer"`, accessible name includes "opens in a new tab").
2. **New game:**
   - Rules options: Badge (random / choose), reconnect grace time, advanced variants.
   - Then the **Invite** sheet: join code, QR, Share link (`https://duel.example.com/#join=K7Q2MX`), and a "waiting for opponent" status.
3. **Join:** enter the code, scan a QR, or open the link directly. Ask for a display name on first use.
4. **Game table**, one adaptive layout:
   - Opponent strip: name, connection dot, Health, Cross, Fang, Hourglass, Badge, hand-size, and plan status.
   - Table area: plans, revealed cards, Potion target, and the initiative order track.
   - My area: hand, target-card row with the deduction tracker, my markers.
   - A **phase bar** with a one-line instruction and the primary action button.
   - A log/rules drawer.
5. **Plan:**
   - Tap a character to see its card detail and legal targets.
   - Tap targets: illegal ones are disabled, with the reason.
   - A summary ("Knight → Wolfen + Fool") and Confirm (with an optional confirm dialog).
6. **Reveal:**
   - Hourglass stepper with the live effective initiative.
   - The opponent's choice is shown when it arrives.
   - Potion target picker if I hold the Potion.
7. **Showdown:** an ordered resolution list that animates one step at a time (or appears instantly with reduced motion), with plain-language results. Hunter prompt inline.
8. **Round summary** (collapsible) and **Game over:** result, how it was won, "View replay", "Rematch" (same room, Badge to the loser).
9. **History** list, **Replay** viewer, **Stats**.
10. **How to play:** rewritten rulebook, character reference, 5-step interactive tutorial (scripted local game via the memory referee).
11. **Settings**, plus **Backup** (export/import).

**Deduction tracker:**
- My 9 target cards double as a tracker: each is marked mine (auto), possible, or ruled out.
- It can auto-mark using public facts (plan target count, revealed cards). A setting turns the help on or off.

### 8.2 Settings
| Group | Settings |
|---|---|
| General | Install app (see §7); Language: a dropdown, each language named in itself ("System (English)", "English", "Deutsch", "日本語"), so more can be added; Theme (System/Light/Dark); Display name |
| Reading | Text size (90–150%); Reading font (Default / Lexend / OpenDyslexic); Extra letter and line spacing; Card text: icons + text / text only |
| Accessibility | High contrast (on/off, applies to light and dark); Colour-blind patterns on/off (shapes are always on); Reduced motion (System/On/Off); Showdown speed (Step-by-step tap / Auto / Instant); Haptics on my turn |
| Gameplay | Confirm before submitting plan; Rules hints; Deduction auto-mark; Warn on pointless targets; Hunter: always ask / auto when a target matches; Tutorial tips |
| Network | Server (default / custom URL); Data saver (no avatars, no prefetch) |
| Data | A note that data is stored only on this device; Backup (export / import); Clear history; Delete all data (both with confirmation, see §7) |
| About | Version, credits, licences, "© 2026 David F Dev" |

### 8.3 Visual language & assets
- **Placeholder theme:** the default.
  - Each character is an SVG of a coloured shape plus a glyph plus a number.
  - **Faction carried by shape and pattern, not colour alone:**
    - Humans: rounded shield silhouette, solid fill.
    - Werewolves: angular claw-notched silhouette, diagonal hatch.
  - **Marker icons** from Kenney Board Game Icons (CC0), with game-icons.net (CC BY) where needed and credits shown.
  - **Initiative** is always shown as a large number in a fixed corner.
- **Theme packs:**
  - Location: `themes/<id>/theme.json`.
  - Contents: tokens (colours, radii, fonts), `cards` and `markers` maps from engine IDs to SVG files or sprite symbols, credits, licence.
  - Missing entries fall back to the placeholder theme.
- **Palette:** Okabe–Ito-based. All text 4.5:1, UI elements 3:1, tested in light, dark and high-contrast themes.

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
  - Lists are joined with `Intl.ListFormat` in the web app and an equivalent in the CLI.
  - Grammatical case and gender of character names (needed for German) are deferred to M5, where character messages become parameterised.
- **Fonts** (OFL, self-hosted, subset at build time):

  | Role | Latin | Japanese |
  |---|---|---|
  | Body / UI / card text | Atkinson Hyperlegible Next | BIZ UDPGothic |
  | Headings / card names | Cinzel (verify ß/umlaut glyphs; fallback: Marcellus) | Shippori Mincho B1 |
  | Optional reading fonts | Lexend, OpenDyslexic | — |

### 8.5 Accessibility
- **WCAG 2.2 AA:**
  - 44 px targets; visible focus.
  - Everything works by tap and keyboard, with no drag required.
  - Reflows at 320 px and at 200% text size.
- **Screen readers:**
  - Cards are `button`s with full accessible names, e.g. "Knight, initiative 3, Human. Gain an Hourglass; attack a Werewolf."
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

## 10. Testing & delivery

**Test tiers:**

| Tier | Tools | Scope |
|---|---|---|
| Engine | `cargo test`, proptest, `wwd fuzz` | Every rule in §5 as a named test; determinism (same seed + commands → same hash); redaction (no `View` for seat X ever contains Y's hidden data) |
| Referee | Vitest, memory adapter, fake clock | Join, seats, reconnect, grace, pause/resume, rate limits, redaction on the wire |
| Client | Vitest + Testing Library, in-memory transport | Components and stores |
| End-to-end | Playwright: `e2e` (local mode) and *(M3)* `e2e:online` vs the Node referee started in the test runner's process on localhost, with test overrides and a temporary data folder | Desktop Chrome and Pixel 7 emulation; later an Android emulator via Playwright `_android` or Appium (`10.0.2.2`). Two-browser-context games: a full game, going offline and back, a hidden tab reconnecting, PIN rejoin, approval rejoin, claim win after a short `test.grace_ms`, resign, invite links and an unknown room |
| Parity | *(M3)* `e2e:parity`: the tests tagged `@parity` vs `wrangler dev` (local workerd, no account) | Catches Cloudflare-specific differences, locally |
| Accessibility | axe-core in Playwright | Plus a manual screen-reader pass per milestone |
| Staging | *(M3)* `scripts/smoke.mjs` after each deploy | The only tier touching Cloudflare: `/health`, one room, two players welcomed and sent the opening events, then one resigns so the room is kept only for the finished-room retention. Four requests, or up to seven when `/health` is retried after a fresh deploy; Node built-ins only, with a time limit and a bounded close. Its own test runs it against a Node referee on a free port |

**CI (GitHub Actions):**
- The `engine` workflow runs fmt, clippy, tests and fuzz.
- The `app` workflow builds the engine's WASM and the app, then runs lint, the unit tests (including the smoke script's test and a check that a sub-path build loads every asset from under its base), `e2e` and `e2e:online`. `e2e:parity` runs only when the workflow is started by hand.
- *(M3)* The `deploy` workflow runs on pushes to `main` and by hand. Each job runs only when its secrets and variables are set, so a fresh fork stays green, and each has least-privilege `permissions`.
  - `referee-staging` deploys with `--env staging`, then runs the smoke test. `referee-production` follows only if that passed, behind the `production` environment's required reviewers, and smoke-tests production. Both deploy through the package's `deploy:*` scripts, which refuse to run without a safe `ALLOWED_ORIGINS` list, with any `TEST_OVERRIDES` var, or with an `--env`, `-e`, `--name`, `--config` or `-c` option that would deploy another environment, Worker or config. Their tests run a stub named by `WWD_WRANGLER_BIN` (which no workflow sets) and assert the exact arguments handed to wrangler; the one test that runs the real wrangler uses `--dry-run`, with no Cloudflare credential variables and empty config directories, so it cannot authenticate.
  - `web` builds the app with `VITE_REFEREE_URL` from the `REFEREE_URL` variable and `BASE_PATH` from the Pages site, then publishes it with `actions/upload-pages-artifact` and `actions/deploy-pages`. When the referee is configured it waits for `referee-production` and runs only if that succeeded, so the site never goes live ahead of its referee.
  - Pushes that change only `docs/` or Markdown files don't trigger it. Every job has a timeout.
  - The referees' allowed origins come from the `APP_ORIGINS` variable (https origins only, never `*`), passed as `--var ALLOWED_ORIGINS`. Staging also allows `http://localhost:5173` and `http://localhost:4173`.
  - `docs/deploy.md` is the owner's guide: the Cloudflare token, the GitHub secrets, variables and environment, Pages, the optional custom domains, Docker self-hosting, and costs.

**Hosting:**

| Piece | Where |
|---|---|
| App | GitHub Pages: the project site `https://<github-user>.github.io/<repo>/`, or optionally `https://duel.<your-domain>` (a CNAME to `<github-user>.github.io`, HTTPS enforced) |
| Referee | `https://wwd-referee.davidfdev.workers.dev`, with staging at `https://wwd-referee-staging.davidfdev.workers.dev`; optionally a custom subdomain if the DNS is on Cloudflare |
| Self-hosting | A Docker image of `referee-node`, behind a TLS reverse proxy. The server URL is embedded in the invite link (`#/join/CODE?server=URL`), or *(M4)* set in Settings |

## 11. Left to the builder
- Exact libraries inside the chosen stack (e.g. idb vs Dexie, the QR library, the WASM binding helpers).
- Visual details within the mockups' structure.
- Exact message field names.
- The resume-from-save trust rule: require both players' matching saves, or allow host upload in friend mode. The default suggestion is both, with a fallback.
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
4. **M4 Product:**
   - All screens as mocked, settings, saves/pause, history/replay/stats, backup.
   - PWA install and offline shell.
5. **M5 Reach:**
   - DE and JA, the accessibility pass, the rewritten rulebook, the tutorial.
6. **Later:**
   - LAN host mode, pass-and-play, bot, public matchmaking (accounts, timers, abandon = loss, ratings).
   - Capacitor/Tauri packages, fair-play peer mode, real art.
