# Digital duel card game: research findings & recommendations

*Status: research only, no implementation. Date: 2026-11-21.*
*Sources were gathered by web research on this date. Free-tier limits change often, so re-check them before relying on them.*

---

## 0. Summary of recommendations

| Topic | Recommendation |
|---|---|
| Platform | An installable web app (PWA): one codebase for desktop and phone browsers. Wrap it later with Capacitor (APK) or Tauri (EXE) only if a native-only feature is needed, mainly true offline LAN hosting. |
| Hosting (client) | GitHub Pages (free, HTTPS, custom domain via CNAME, e.g. `play.yourdomain.com`). Your own site works equally well if it serves static files over HTTPS. |
| Online play | *Updated 2026-11-22, see §19.1.* A **referee** for all online play: the engine runs in a Cloudflare Worker + Durable Object (one per join code, hibernating WebSocket), and each client receives only its own view. Self-hostable as Node/Docker. Fair-play peer mode (§19) is deferred; the code keeps an authority/transport split so it can be added later. |
| Joining | A 5-character join code plus QR code and share link. A secret **seat token** lets a player rejoin from any device. |
| LAN/offline | Phase 2: browser-to-browser WebRTC set up by scanning QR codes, needing no Internet. Phase 3 (optional): a native app hosts a local referee and is found automatically on the network. |
| Anti-cheat | The client never receives hidden information it isn't entitled to. Public matchmaking is server-authoritative only. Peer-to-peer play uses commit–reveal plus a two-party fair shuffle. |
| Engine | **Rust** crate, deterministic and hashable, built three ways: native CLI, WASM for the browser and the Worker, and native for the self-hosted server. JSON at every boundary. |
| App | TypeScript + **Svelte 5** + Vite, DOM-rendered (not canvas). Tested with Vitest and Playwright (including Android emulator). Agent-drivable through the accessibility tree plus a dev-only `window.__game` API. |
| i18n | **Project Fluent** (`.ftl` files), so the Rust CLI (fluent-rs) and the web app (@fluent/bundle) share one set of translations. EN / DE / JA. |
| Fonts | Body: Atkinson Hyperlegible Next (Latin) + BIZ UDPGothic (JA). Headings: a display serif (candidates below). Optional reading-font toggle. |
| Storage | IndexedDB: settings, paused sessions, completed-match history (replay logs of ~10–30 KB). Single-file export/import backup. |
| Pass-and-play | Not built now, but enabled by design: the UI only ever renders one player's view, and the connection layer can be swapped out. |

---

## 1. How similar digital games are built (prior art)

- **boardgame.io** (open source, now in maintenance mode)
  - Game logic is a pure reducer.
  - `playerView()` strips secrets before anything is sent to a player, and the server is authoritative.
  - Its peer-to-peer transport is experimental and stale, and the host sees every secret.
  - **Take the pattern, not the dependency.**
- **Board Game Arena**: a classic authoritative server. Clients send intents only. The server owns timers and penalises abandonment.
- **Colyseus / Nakama**: authoritative room servers. Colyseus holds a seat for a grace window (`allowReconnection`) and gives the player a reconnect token. Nakama adds accounts, matchmaking and ratings. Either is a sensible migration target if public matchmaking grows.
- **OpenSpiel** (DeepMind) is the reference API for AI research:
  - `legal_actions(player)`
  - `apply_action`
  - `information_state_string(player)`, a per-player text view
  - shuffles modelled as explicit "chance" steps

  This maps directly onto "an AI agent can drive it".
- **Rust rules engine shared by client and server via WASM**: known examples include Pont (Qwirkle) and phase.rs (Magic: The Gathering). A small rules engine compiles to tens of KB of WASM.
- **Tabletop Simulator** and most indie PeerJS games use a host-authoritative design. The host can see everything, and the game ends if the host leaves. That is fine between friends and unsuitable for strangers.
- **Pass-and-play** is common in digital board-game ports (Root, Wingspan, Ticket to Ride). Hidden-hand games put a "pass the device to Player 2" screen between turns.

---

## 2. Platform: web app vs executable

**Recommendation: PWA first.**

Why:
- One codebase covers Windows, macOS, Linux, Android and iOS.
- No app-store review or fees.
- It updates instantly and is installable to the home screen.
- It works offline after the first visit.
- A DOM-based UI gives screen-reader support and agent-driving for free.

Caveats:
- **iOS Safari** may evict storage for sites not used for 7 days, unless the app was installed to the Home Screen. Mitigations: prompt iOS users to install, and make the backup export prominent.
- **Browsers cannot open a listening socket.** True "host a game on my LAN with no Internet" therefore needs either a QR-code WebRTC handshake (§4.3) or a native wrapper.

**Wrappers, when needed:**
- **Capacitor**: the more mature option for an Android APK.
- **Tauri 2**: good for a small EXE. Its mobile support works but is younger.

Both reuse the same web build. I don't recommend Flutter, Godot or Unity: larger downloads, canvas rendering that hurts accessibility and agent-driving, and higher idle power use.

---

## 3. Hosting

- **GitHub Pages** works for the client: static files, HTTPS, a service worker for offline use, and a custom domain via a CNAME record. It cannot run server code, so the referee lives elsewhere.
- **Your own domain/site** is equally fine for the client, e.g. `play.<yourdomain>` pointing at GitHub Pages, or uploaded directly to your existing host.
- **Referee (free default): Cloudflare Workers + Durable Objects, free plan.**
  - Limits: 100k requests/day; WebSocket messages count as requests.
  - At about 200 messages per game, that's roughly **500 games/day free**.
  - Over the limit, requests fail rather than bill you.
  - The WebSocket Hibernation API means idle games cost nothing.
  - Rust compiled to WASM runs inside Workers, so the referee uses the *same engine binary*.
  - You need a free Cloudflare account.
- **Self-hosted / paid:** the same referee logic in a small Node (or native Rust) WebSocket server shipped as a Docker image. The client just points at a different URL (a server URL setting).

Alternatives considered:

| Option | Why not the default |
|---|---|
| Firebase RTDB | 100 concurrent-connection cap |
| Supabase Realtime | Free projects pause after inactivity |
| Deno Deploy | No stateful-room primitive |
| PeerJS public server | No SLA; reported drops after 10–20 minutes |
| Trystero over Nostr/MQTT | Best-effort public relays; chattier on mobile data |

---

## 4. Connecting players

### 4.1 A rule-level finding that drives the design

Each round the 8 character cards are **shuffled, one is discarded unseen, and the hands (4 / 3) are dealt secretly**. That is *hidden randomness*: somebody has to deal fairly without either player seeing the other's hand.

- **With a referee**, this is trivial: the referee deals and sends each player only their own hand.
- **Peer-to-peer without a referee**, it needs a cryptographic two-party shuffle (a "mental poker" technique, e.g. commutative encryption) *in addition to* commit–reveal for the simultaneous plans.

This is the main reason I recommend the referee as the default and P2P as a later mode.

### 4.2 Online (default)

1. Player A taps **Create game**. The referee creates a room and returns:
   - a join code (e.g. `K7Q-2M`) plus QR code and share link;
   - A's secret seat token.
2. Player B enters the code or opens the link and receives their own seat token.
3. Both clients keep one WebSocket open to the referee. Each sends **commands** and receives **events filtered to their own view**.

### 4.3 LAN / no Internet (phase 2)

- The PWA is already cached, so it loads offline.
- The two browsers connect directly over WebRTC, exchanging the ~200-byte connection info by **scanning each other's QR codes** (two scans). No signalling server is needed on the same network.
- Fairness comes from commit–reveal plus the two-party shuffle (§6.2), so neither device is trusted.
- Caveats:
  - Guest Wi-Fi or access points with "client isolation" can block it.
  - Label it best-effort.
- Phase 3 (optional): the native app hosts a local referee and is discovered via mDNS. This is the most reliable option.

### 4.4 Online P2P (optional)

The same WebRTC mode with signalling through the Worker. TURN relays are needed for ~10–25% of pairs, especially on mobile networks. Cloudflare Realtime TURN has a large free allowance, and the Worker would issue the short-lived credentials.

---

## 5. Reconnection & tab switching (mobile)

- **Assume the connection dies** whenever the tab or app is backgrounded. iOS suspends networking, and Android throttles background tabs.
- **Event log + sequence numbers:**
  - Every event the referee sends carries `seq`.
  - On resume, the client sends `resume{gameId, seatToken, lastSeq}` and gets back only the events it missed, already filtered to its own view.
- **On `visibilitychange` → visible:** ping. If there is no reply within 2–3 s, rebuild the socket. Also watch for gaps in timer callbacks, because some suspensions never fire the visibility event.
- **Grace window:** the referee holds the seat (e.g. 10 min, configurable per game). The opponent sees "Waiting for Alex to reconnect… (9:41)", and can then choose to keep waiting, pause the session, or claim the win.
- **A different device:**
  - The seat token *is* the identity.
  - **Rejoin QR / code** in the game menu ("Continue on another device").
  - It is also stored in local storage, and included in backups.
  - **Accounts are not needed.**
- **Heartbeat:**
  - None while hidden.
  - While visible, a ping every ~30 s. Durable Object auto-response pings don't wake the object.

## 6. Netcode safety & anti-cheat

### 6.1 Referee mode (default; required for public matchmaking)

- **Clients only ever receive their own view.** A modified client cannot reveal the opponent's hand or plan, because the data never reaches it.
- **Every command is validated by the engine on the referee**, so an illegal move is rejected.
- **The plan is a sealed submission.** The referee reveals nothing until both plans are locked in.
- **Verifiable shuffle (optional transparency layer):**
  - At game start, the referee publishes `hash(seed)`.
  - At game end, it reveals the seed.
  - Both clients replay the log and confirm every deal was honest.
  - This costs almost nothing and is a nice trust signal.
- **For future public matchmaking, also add:**
  - server-owned move timers
  - abandon-equals-loss
  - rate limiting
  - anonymous device keys or OAuth accounts
  - a signed replay log for disputes

  P2P mode is never used for ranked play with strangers.

### 6.2 P2P mode (friends / LAN)

- **Simultaneous plans:** commit–reveal.
  - Each player sends `SHA-256(gameId‖round‖seat‖plan‖128-bit salt)`.
  - Once both commitments have arrived, both reveal and each side verifies the other's.
- **Hidden deal:** a two-party fair shuffle (commutative-encryption shuffle over 8 cards).
- **What P2P cannot prevent:** refusing to reveal or rage-quitting (shown as a forfeit after a timeout), and helper overlays.

### 6.3 Rules subtlety to confirm

In the physical game, the opponent can probably *see how many* target cards sit under your character. If that's intended public information, the digital version should show it. If not, every plan is padded to a fixed size. (Question Q4.)

---

## 7. Engine ("Engine" repo)

### 7.1 Language: Rust (recommended) vs TypeScript

**Rust**
- Pros:
  - Compiles to WASM, so one engine serves browser, Worker, CLI and native server.
  - Strong enums for commands and events.
  - Exhaustive matching.
  - Easy determinism.
  - proptest for fuzzing rules.
  - Small binary.
- Cons:
  - Two languages in the project.
  - A WASM build step.
  - JS/Rust boundary types (generated with `tsify-next`).

**TypeScript-only**
- Pros: simplest toolchain, and it would be fine for a game this small.
- Cons:
  - Weaker determinism guarantees (number semantics, key order, stray `Math.random`).
  - The CLI needs Node.

I'd go with Rust, as you suggested: it fits the "standalone library others could use" goal and the CLI/testing story best. Keep the WASM boundary coarse: whole commands in, views and events out, as JSON.

### 7.2 Shape of the engine

```
Game::new(seed, config) -> State
legal_actions(&State, Seat) -> Vec<Command>     // drives UI, AI agents, bots
apply(&mut State, Seat, Command) -> Result<Vec<Event>, RuleError>
view(&State, Seat | Spectator | Omniscient) -> View   // redacted per player
hash(&State) -> [u8; 32]                      // BLAKE3 over canonical bytes
Replay { format_version, engine_version, seed, config, commands[], checkpoints[] }
```

- **Commands vs events:**
  - Commands are intents, e.g. `SubmitPlan{character, targets}`, `PlaceHourglasses{n}`, `UsePotion{target}`.
  - Events are facts, each with a visibility, e.g. `HandDealt{to: P1, cards}` or `PlanRevealed{...}`.
  - Per-player event filtering gives each player a redacted history for free.
- **Phase state machine** (each step either waits for input or applies a rule):

  RoundStart → Plan (simultaneous) → Reveal-Hourglass (badge holder, then the other player) → Reveal-Potion → Showdown → RoundEnd / GameOver

- **Determinism:**
  - No `HashMap` iteration, no floats, no clock, no locale.
  - ChaCha8 RNG with its state stored inside `State`.
  - Canonical serialisation for hashing.
- **No strings in the engine.** It emits keys and structured data, and the app localises them.
- **Rules as data where it helps:** characters, factions and abilities live in a content table. That makes errata and variant rules (old vs new initiative tie-break) a config flag rather than a code fork: `RulesConfig { tiebreak: HourglassThenBadge | BadgeOnly }`.
- **Unsafe editing:**
  - Behind a cargo feature (`unsafe-edit`) and a CLI `--unsafe` flag, e.g. `set health p1 1`, `give p2 fang 2`, `set-hand p1 Seer,Witch,...`, `load-state file.json`.
  - Replays that used unsafe edits are marked **tainted**.
  - Never compiled into the referee.

### 7.3 CLI

Supports interactive play (hot-seat with per-seat views), `replay <file> --step`, `verify <file>` (re-simulates and checks hashes), `fuzz`, and the unsafe commands. Output is JSON (`--json`) for tooling or Fluent-localised text for humans.

### 7.4 Repos

| Repo | Contents |
|---|---|
| **engine** (Rust workspace) | `core` (rules), `protocol` (wire messages, shared with the referee), `cli`, `wasm` (bindings + TS types) |
| **app** (TypeScript) | `web` (Svelte PWA) and `referee` (Cloudflare Worker + Node/Docker adapter), both importing the engine's WASM package |

The referee sits with the app because the two are deployed and versioned together. If others want to self-host without the app, it can move out later.

---

## 8. App ("App" repo)

- **Svelte 5 + Vite, static build, PWA (vite-plugin-pwa).** It is small, and idle CPU is near zero because it only re-renders on state change. No animation loop and no canvas.
- **Layered so it is testable:**
  - The **connection layer** is a swappable interface (`Transport`):
    - Referee WebSocket
    - P2P WebRTC
    - Local, used for tests, the CLI-like offline mode, and future pass-and-play / vs-bot
  - The **game client store** holds the current `View` and legal actions.
  - **UI components** are pure functions of the store.
- **Tests:**
  - Vitest + Testing Library for components and stores.
  - Playwright for end-to-end on desktop and mobile emulation.
  - Playwright's Android mode, or Appium, against the emulator for real-device checks.
  - The engine has its own Rust test suite.
- **AI-agent driving:**
  - Semantic HTML. Every card and action is a labelled `button` with a stable `data-testid`.
  - Playwright MCP-style agents read the accessibility tree.
  - A dev-build-only `window.__game = { view(), legalActions(), act(cmd) }` mirrors the engine API.
  - WebMCP (an emerging W3C draft for registering typed agent tools) can be added later.

### 8.1 Screens (to mock up next)

1. **Home**: Continue game(s), New game, Join game, Rules, History, Settings.
2. **Create / Join**: code + QR + share link; join by code, QR scan or link; connection mode (Online / LAN).
3. **Lobby**: both players present, who gets the Badge (random, or "looks most like a werewolf" as a fun toggle), rules options.
4. **Game board**, one adaptive layout with a phase banner:
   - Top: opponent (health, fang, cross, hourglass counts, badge, cards-in-hand count, connection status).
   - Middle: play area, showing face-down plans, then revealed character, targets and potion.
   - Bottom: my hand (3–4 characters) and my 9 target cards. The target cards act as a **deduction tracker** (tap to mark "I hold this" / "possible").
   - A side or bottom sheet holds the turn log and rules reference for the current phase.
   - Phases:
     - **Plan**: pick a character, pick targets (Fool allowed), confirm.
     - **Reveal**: the hourglass stepper, with the effective initiative shown live.
     - **Potion**: pick a target.
     - **Showdown**: a step-by-step resolution list ("Wolf King (2) attacks Knight → Knight eliminated, −1 health").
5. **Round summary / Game over**, with "View replay".
6. **History**: list of completed sessions, plus a replay viewer (step through rounds, with my view / both views after the game) and stats (win rate, character usage, win conditions).
7. **Rules**: rewritten rulebook, character glossary, interactive tutorial.
8. **Settings** and **Backup** (export/import).

Rough text sketch of the game board on a phone:

```
┌─────────────────────────────┐
│ Opponent ♥♥  ✚1  ⧗2  ★Badge │
│ hand: 3   ● connected       │
├─────────────────────────────┤
│  PLAN PHASE — choose 1      │
│  character + target(s)      │
│   [ ? ]  ← opp. plan ready ✓│
│   [ Knight ⓷ ] → [Wolfen?]  │
├─────────────────────────────┤
│ My hand: [Knight 3][Seer 5] │
│          [Wolf King 2]      │
│ Targets: H WK K W S Wi WB V │
│          Fool               │
│ ♥♥ ✚1 ⧗0        [Confirm]   │
└─────────────────────────────┘
```

---

## 9. Save / load, history, backup

- **Key insight:** every round reshuffles all 8 characters, so **at a round boundary nothing hidden carries forward.** The state is only health, fang, cross, hourglass, badge, potion owner and round number.
- **Pause & resume:**
  - A session can be paused at any time. It resumes at the **start of the current round**, re-dealt with the same seed.
  - Each device stores the paused session (timestamped) in IndexedDB.
  - Either player can resume it with the other: the host re-creates a room from the save, and the guest rejoins with their seat token or the code.
  - Saves contain no secrets, so no cheating via save files.
  - Mid-round state is kept only by the referee, for reconnection.
- **Match history:**
  - Yes, worth it, and cheap: a replay log is ~10–30 KB per game.
  - Each device stores its own *redacted* log. The full log (all hands) is exchanged after the game ends, so the replay viewer can show both sides.
  - Metrics: wins/losses by win condition, character pick rates, success rates, average game length.
- **Backup:**
  - A single file (`*.wwdbackup`): gzip-compressed JSON containing format version, settings, paused sessions, history and seat tokens, plus a checksum.
  - Export via the save-file picker where supported, with a download or the Share sheet as fallback.
  - Import merges by session ID.

## 10. Bandwidth & battery

- **Data:**
  - Gameplay JSON is ~60–150 bytes per message, ~10–30 KB per game, so JSON is fine.
  - Keepalives dominate: a WebSocket ping every 30 s is ~25 KB/hour.
  - A WebRTC data channel idles at ~50–100 KB/hour.
  - The referee WebSocket is therefore the most data-efficient option. No polling.
  - Assets are cached by the service worker, so after the first visit a game costs only messages.
- **Battery:**
  - No render loop. Re-render only on events.
  - Animations are short CSS transitions that respect reduced motion.
  - Sockets close while the app is hidden.
  - Fonts are subset (Japanese split into slices or subset to the known card text at build time).
  - Target initial download: under ~300 KB plus fonts.

## 11. Localisation & fonts

- **Fluent** (`.ftl`) shared by the CLI and the app. It handles German cases and plurals without code changes.
- Pseudo-localisation in tests catches overflow. German runs ~30% longer.
- **Japanese:**
  - `lang="ja"`, `word-break: auto-phrase`, `line-break: strict`, line-height ~1.7.
  - No synthetic bold or italic.
- Card text boxes flex and shrink down to a minimum size.
- **Fonts** (all SIL Open Font License):

| Role | Latin (EN/DE) | Japanese |
|---|---|---|
| Body / UI / card text | Atkinson Hyperlegible Next | BIZ UDPGothic (Morisawa "universal design") |
| Headings / card names | Display serif, e.g. Cinzel or IM Fell (verify ß/umlaut coverage) | Shippori Mincho B1 or Zen Antique |
| Numbers (initiative) | Tabular figures from the body font | same |
| Optional reading font | Lexend / OpenDyslexic toggle | — |

Note on dyslexia fonts: studies (2016, and a 2026 meta-analysis) found no consistent benefit from "dyslexia fonts". The evidence-backed levers are size, letter and line spacing, short line length and left alignment. So expose those as settings, and keep the font choice as a preference rather than a fix.

## 12. Accessibility

- **Never rely on colour alone.**
  - Faction = icon + shape + text (e.g. a shield for Human, a claw for Werewolf).
  - Markers each have a distinct silhouette.
  - Okabe–Ito palette.
  - Test with colour-vision-deficiency simulators.
- **WCAG 2.2 AA:**
  - Contrast of 4.5:1 for text and 3:1 for UI elements.
  - Tap targets of 44 px or more.
  - Visible focus.
  - Tap alternatives to any drag.
  - Works at 320 px wide and with 200% text size.
- **Screen readers:**
  - Cards are labelled buttons.
  - Hands are lists.
  - An `aria-live` log announces opponent actions.
  - A "Describe the table" button reuses the agent text view.
- Keyboard shortcuts. No time pressure by default (timers optional).
- Use the Game Accessibility Guidelines (basic + intermediate) as the checklist.

## 13. Art

- **Theme packs:**
  - `themes/<id>/theme.json` maps engine IDs (`character.seer`, `marker.fang`, `faction.werewolf`) to SVGs, colour tokens, fonts and credits.
  - The UI resolves art only through the manifest, and a missing entry falls back to the placeholder theme.
- **Placeholders:**
  - Simple shapes plus Kenney Board Game Icons (CC0, no attribution needed).
  - game-icons.net (CC BY 3.0) is also usable if a credits screen is maintained.
- **The physical game's artwork is copyrighted** by the publisher. It cannot be used without a licence (see §18).

## 14. Settings to expose

- **General:** language, theme (light / dark / high contrast / system).
- **Display:** text size, reading font, letter/line spacing, colour-blind patterns, reduced motion (defaults to the system setting).
- **Gameplay:**
  - Confirm before submitting a plan (on/off).
  - Show effective initiative and rule hints.
  - Auto-mark deduction tracker (marks my own hand's target cards, per the rulebook "Tip").
  - Tutorial hints on/off.
  - Show the opponent's card count in the plan.
- **Sound:** on/off and volume, if sound is added; vibrate on my turn.
- **Network:** server URL (self-host), reconnection grace time (host's choice), data-saver (no avatars or extra assets).
- **Privacy:** display name, clear history.
- **Backup:** export, import.

## 15. Pass-and-play (future, enabled by design)

These design rules make it a small later addition:

1. The UI only ever renders `view(state, seat)`.
2. A `LocalTransport` can host two seats.
3. A "Pass to <name> — tap when ready" screen appears whenever the viewing seat changes.

The same machinery gives an offline vs-bot mode and the CLI hot-seat mode.

## 16. Rulebook rewrite

Recommended structure:
1. Overview & how to win (3 ways)
2. Components (with marker supply limits)
3. Setup
4. A round, step by step (one section per phase, with a worked example)
5. Initiative & attacks (including the updated tie-break rule)
6. Character reference: one block each, with initiative, faction, ability, and the FAQ folded in
7. The Fool (including the designer's clarification)
8. Glossary

It should be localised along with the app, as Fluent/Markdown per language. It also doubles as the source for in-game tooltips.

---

## 17. Card reference (from `cards.pdf`, 2026-11-22)

| Init. | Character | Faction | Card text | Engine reading |
|---|---|---|---|---|
| 1 | Hunter | Human | Spend one Cross Marker to attack two Werewolves. | Up to 2 Werewolf targets. When it resolves, the owner may spend 1 Cross. If they have none, or decline, there is no attack. |
| 2 | Wolf King | Werewolf | Attack a Human. May attack one more Human per Fang Marker paid. | 1 + N Human targets. On resolution, pay N Fangs. If the owner can't pay in full, they pay nothing and the whole attack fails. |
| 3 | Knight | Human | Gain an Hourglass Marker; Attack a Werewolf. | 1 Werewolf target. If it resolves (not eliminated first), it gains an Hourglass even if the attack misses. |
| 4 | Wolfen | Werewolf | Gain an Hourglass Marker; Attack anyone. | 1 target of any faction, plus an Hourglass as with the Knight. |
| 5 | Seer | Human | Attack a Werewolf. The target loses 2 Health Markers instead of 1. | 1 Werewolf target; a hit deals 2 damage. |
| 6 | Witch | Human | Gain the Potion Marker. Must spend to attack an additional Character in the next Reveal Phase. | Gains the Potion. In the next round's Reveal (step C) it must be spent on one unplayed target card, and it hits first in Showdown. |
| 7 | Wolf Beauty | Werewolf | Gain a Fang Marker (three to win). Attack anyone. | 1 target of any faction, plus 1 Fang. |
| 8 | Villager | Human | Gain a Cross Marker (four to win). | No attack. The Fool may be placed as a bluff. |

- **Icon key** (player aid):
  - Crosshair = attack a Werewolf.
  - Claws = attack a Human.
  - Claws | crosshair = attack any character.
  - Green ring = gain the marker.
  - Red ring with ▶ = spend the marker for an effect, repeatable.
- **Factions:** Humans are Hunter, Knight, Seer, Witch and Villager (5). Werewolves are Wolf King, Wolfen and Wolf Beauty (3).
- **Win/lose:** 4 Cross or 3 Fang wins immediately. 0 Health loses. Every check is immediate, and resolution is sequential, so a simultaneous win can't happen.

### Remaining rules questions (proposed default in *italics*)

1. Is the **number** of target cards in a plan public? It is physically visible. *Default: yes, shown to the opponent.*
2. May a target card that the character **can't legally attack** be placed as a bluff, e.g. a Human target under the Knight? *Default: no. Only legal targets plus the Fool. That matches the designer's Fool clarification, which makes the Fool the bluffing tool.*
3. Does every plan need at least one target card? **Decided (2026-11-22): yes, at least one.** A Villager or Witch must place the Fool. Default `min_targets: 1`.
   - **Mandatory:** the rulebook's Plan Phase says "ONE or MORE".
   - **Optional:** the player aid says "Any Target Cards you wish to attack". The designer's clarification ("If you don't place any Target card…") also describes zero targets as a possible play.
   - Because plan size is public, an empty plan always gives away Villager or Witch. A sensible player would add the Fool anyway, so the strategic difference is small. The real difference is protecting players from an accidental tell.
   - **Engine:** a rules option, `RulesConfig.min_targets: 0 | 1`. The default is 1, and 0 remains available as a variant.
4. **Hunter's choice** whether to spend the Cross. *Default: the Hunter's owner is asked during Showdown, after all cards are revealed. A setting can auto-spend only when a target matches.*
5. Can a Wolf King place more targets than it holds Fangs, as a bluff? *Default: yes. The attack then fails at payment, per the FAQ.*
6. **Marker supply:**
   - Spent Hourglass, Fang and Cross markers return to the supply.
   - When the Hourglass supply is empty, gains come from the opponent.
   - When the Fang or Cross supply is empty, the gain is lost. This can't happen with 5 Fangs and 7 Crosses before someone wins.
   - *Default as stated.*
7. **Badge holder in round 1:** *Default: chosen randomly, with a "decide among yourselves" option in the lobby.*

## 18. Name, artwork & permission (decided 2026-11-22)

- **Title:** "Werewolf: Duel! Online" — *An unofficial digital version of Werewolf: Duel!*
- **Character role names:** used as printed.
- **Rules wording:** our own.
- **Art:** original placeholder shapes. No original art assets are used.

## 19. Friends without a middle-man (decided direction, 2026-11-22)

**Constraint:** two browsers on the Internet can't find each other without *some* rendezvous point.
- Direct WebRTC still needs a signalling server to exchange connection details.
- 10–25% of pairs, especially on mobile networks, also need a TURN relay.

So the real choice is not whether there is a server. It is **what the server knows and decides.**

| Mode | Who enforces the rules | What the server sees | Who it's for |
|---|---|---|---|
| **Fair-play (peer)** | Both clients, each running the full engine, kept honest by cryptography | Nothing useful: opaque, end-to-end encrypted messages | Friends, LAN |
| **Refereed** | The referee (Cloudflare Durable Object or a self-hosted server) | Everything | Public matchmaking (later) |

### Fair-play protocol: no trusted party

- **Secret deal each round (mental-poker shuffle):**
  1. Each player picks a fresh secret key for the round.
  2. A encrypts all 8 cards with a *commutative* cipher (Ristretto255 scalar multiplication), shuffles them and sends them to B.
  3. B does the same.
  4. To give a card to A, B removes B's layer from that card, and A removes A's own.
  5. The discard is never decrypted.
- **Plan:** commit–reveal. Each player sends `hash(round, seat, plan, salt)`, and plans are revealed only once both commitments have arrived.
- **Hourglass, potion and Hunter decisions:** made in turn and public, so they are plain signed messages.
- **End-of-game audit:**
  - Both players reveal their round keys.
  - Each client re-checks every deal and that every played card was really in its owner's hand.
  - A cheat is detected and the game is marked invalid.
  - Hands stay hidden *during* play, exactly as in the physical game.
- **What it can't stop:** quitting or refusing to reveal. This is handled as a forfeit after the reconnection grace window.

### Transport: a dumb relay mailbox

- One Cloudflare Durable Object per join code. It forwards and *stores* opaque messages, so a player who switches apps or changes device catches up from the stored log.
- The relay can't read messages: the end-to-end key is in the invite link or QR code, after the `#`, and is never sent to any server. It can't decide anything either.
- Data and battery cost is lower than WebRTC: a single hibernating WebSocket.
- Self-hostable as a tiny Node/Docker relay. A no-infrastructure fallback is Trystero over public relays.
- WebRTC direct (online, or QR-code LAN) is a later alternative transport carrying the *same* protocol.

### Code shape

```
engine (Rust)
  core        rules state machine: commands → events, view(seat)
  fairplay    deal/commit/reveal/audit protocol (curve25519-dalek, sha2/blake3)
  protocol    wire message types (JSON)
app
  Authority   interface: FairPlayPeer | RemoteReferee | LocalHotseat
  Transport   interface: RelayWebSocket | WebRTC | InMemory (tests)
  referee/    Cloudflare Worker: relay mailbox now; referee authority later (same engine)
```

Moving to public matchmaking later means adding the `RemoteReferee` authority and running the engine inside the same Worker. The UI and transport don't change.

**Trade-off:** fair-play is more work than a referee. It needs the deal protocol plus an audit, and the cryptography should be built only on well-reviewed primitives and fuzz-tested. Fair-play friends' games are *unranked*.

### 19.1 Revised recommendation: referee first (2026-11-22)

| | Referee (server decides) | Fair-play peer (cryptography decides) |
|---|---|---|
| Build effort | Low: the engine runs in the Worker; clients send commands and render views | High: shuffle protocol, commit–reveal, end-of-game audit, plus the engine on both clients |
| Correctness risk | One source of truth; no possibility of the two sides disagreeing | Two engines must stay in lock-step; hand-built crypto protocol |
| Reconnect / switch device | Trivial: the seat token alone restores everything | Hard: the round's secret keys live on the device. If the phone dies mid-round, that round has to be voided and re-dealt |
| Cheating by a player | Impossible to see hidden info; illegal moves rejected | Caught, but only by the end-of-game audit |
| Cheating by the operator | Whoever runs the server *could* see hands. This is mitigated by a published seed hash that proves the deals weren't rigged, but it can't prove nothing was peeked | Nobody can see anything |
| Needed for public matchmaking anyway | Yes, so nothing is thrown away | No; that needs a referee anyway |
| Data per game | Lowest | Somewhat more (shuffle round-trips each round), still kilobytes |
| Works with no server at all (LAN) | Only if one device hosts the referee (a browser can't accept connections, so this means a native app or "host" mode where the host could peek) | Yes, over WebRTC |
| Free-tier ceiling | ~500 games/day on Cloudflare free | Higher, because the relay does less work |

**Decision:** build the **referee** first, for friends and later for strangers alike.
- The authority/transport split stays in the code, so fair-play peer mode can be added later if a server-free LAN mode is ever wanted.
- Until then, offline LAN (a quality-of-life feature) would use host mode: one device runs the referee locally. That is acceptable between friends sitting together.

### 19.2 Host-agnostic referee & local testing

The referee is a pure **room core** plus thin host adapters. Nothing outside the adapters knows about Cloudflare.

```
referee-core   Room::handle(Inbound{seat, msg}, now) -> Vec<Outbound{to, msg}>
               + Storage trait (load/save room snapshot + event log)
               + Clock/Timer trait (grace windows, timeouts)
               no I/O, no platform APIs; uses the engine directly
adapters
  memory       in-process, synchronous: unit + integration tests, CLI, future pass-and-play/vs-bot
  node         plain WebSocket server (ws) + file/SQLite storage: local dev, self-hosters, Docker, any VPS
  cloudflare   Durable Object + hibernating WebSocket + DO storage: the free public deployment
```

- **Wire protocol:** versioned JSON over WebSocket. It is defined once in the engine's `protocol` crate and is identical for every adapter, so the app only needs a server URL.
- **Room IDs and join codes:** generated by the core, not the platform.
- **Portability:** moving hosts (Fly.io, a VPS, Deno, a paid server) means writing one adapter of about 100–200 lines. The rest of the system is untouched.

**Testing tiers. None of them touches the Cloudflare quota:**

| Tier | What runs | Speed | Used for |
|---|---|---|---|
| Engine unit/property tests | Rust only | ms | Every rule, determinism, hashing, fuzzing |
| Referee tests | Room core + memory adapter, fake clock | ms | Join, reconnect, timeouts, redaction ("does P2 ever receive P1's hand?") |
| App component tests | Vitest with a memory transport | ms | UI logic without any network |
| Local end-to-end | Node adapter on `localhost` + Playwright (desktop, mobile emulation, Android emulator via `10.0.2.2`) | seconds | Full app flows; also day-to-day manual play on the LAN |
| Cloudflare parity | `wrangler dev` (runs the Workers runtime locally, offline, no quota) | seconds | Catches platform-specific differences before deploy |
| Staging | A separate `staging` Worker on Cloudflare | real | A short smoke test after deploy. It is the only tier that uses quota, and only a few requests |

The same end-to-end suite runs against the Node adapter and `wrangler dev`, so both hosts stay in step.

## 20. Hosting example

Assume your domain is `example.com` and the GitHub repo is `<you>/werewolf-duel-online`.

| What | Where | How |
|---|---|---|
| Your existing site | `example.com` | Unchanged. Add a "Play Werewolf: Duel! Online" link. |
| The game (PWA) | `https://duel.example.com` | GitHub Pages: a GitHub Actions workflow builds Vite and publishes with `actions/deploy-pages`. In DNS, add `CNAME duel → <you>.github.io`. In repo Settings → Pages, set the custom domain and tick "Enforce HTTPS", and GitHub issues the certificate. |
| Fallback URL | `https://<you>.github.io/werewolf-duel-online/` | Works automatically, but needs Vite `base` set to the sub-path. That's another reason to prefer the subdomain. |
| Relay (later the referee) | `https://duel-relay.<account>.workers.dev`, or `relay.duel.example.com` | Cloudflare Worker + Durable Object, deployed with `wrangler deploy` from CI. A custom domain on a Worker requires the domain's DNS to be on Cloudflare. Otherwise use the free `workers.dev` URL, which is invisible to players. |
| Self-hosters | any URL | `docker run …/werewolf-duel-relay`. Players paste the server URL in Settings, or it's embedded in the invite link. |

**Why a subdomain:** clean root-relative paths, a separate service-worker scope from your main site, and you can move hosting later without changing links.

**Alternative:** Cloudflare Pages hosts the static app for free and gives a preview URL for every pull request. That's handy for testing on a phone or the emulator before merging, and it keeps the app and relay in one account. GitHub Pages is the simpler start. Switching later is a DNS change.
