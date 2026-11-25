# Layout Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Every screen and dialog in the web app looks like `docs/mockups/mockups.html`. Screens the mockups don't show use the same kit, so the whole app looks consistent.
- Every game screen fits on one screen without scrolling.
- Game text is correct from every point of view. It's easy to scan: bold names and marker icons.
- Cards show their abilities as icons.

**Architecture:**
- **A visual harness comes first.** A dev-only gallery route renders every screen and dialog from fixed fixture states, with no network. A Playwright script then captures each mockup phone beside the matching app screen, at several sizes and looks. Every later task's review compares those images, not just the code.
- **Engine and text work comes next:**
  - attack events name both characters;
  - the round's discarded card is revealed at round end;
  - the engine describes each character's ability as data.

  A rich-text renderer then bolds names and puts icons before marker words.
- **Then the screens are rebuilt** from a shared layout kit, one mockup at a time. Game screens are built phase by phase, so each one shows only what that phase needs.
- **Unchanged:**
  - routes, test ids and Fluent ids, except where a task says otherwise;
  - the referee;
  - the rules, except for revealing the discard after the round.

**Tech stack:** the existing Rust/WASM engine, Svelte 5, Vite and Playwright. The only new dependency is `@fontsource/marcellus`.

**Spec:** `/docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md`, chiefly §5 (rules), §8 (UX, visual language and accessibility) and §8.4 (localisation and perspective). `docs/mockups/mockups.html` is the **binding visual reference** for layout, spacing, hierarchy and components: §8.1 says what each screen contains, and the mockups say how it looks.

**Revision (2026-11-24, after the Task 5 owner checkpoint):** the design note `docs/superpowers/specs/2026-11-24-cards-plan-home-design.md` replaces the cards, the plan screen and Home. For those, `docs/mockups/cards-and-plan.html` **sections H and I** are the binding visual reference and override mockups 1 and 3; its other sections are rejected alternatives. Tasks 1–5 are done; Tasks 5A and 5B rework them and run before Task 6.

## Owner decisions (agreed 2026-11-24)

| # | Decision |
|---|---|
| 1 | **Desktop:** the app is one phone-style column, at most 30 rem (480 px) wide, centred on wider screens, with the page background (`--bg`) either side. The bar and the phase bar span the column. |
| 2 | **Heading font** *(revised 2026-11-24: Cinzel dropped; Marcellus everywhere, including the app title and the big result line)*: Marcellus (the spec's named fallback; mixed case, OFL, self-hosted) is used for section labels, panel titles and dialog titles. |
| 3 | **Target size:** controls are drawn at the mockup's size, but every interactive element has a hit area of at least 44 × 44 px. |
| 4 | **Decoration:** the night-sky bar with its moon emblem and the treeline silhouette ship as in the mockup. They're decorative, `aria-hidden`, static, and come from the placeholder theme pack. |
| 5 | **No scrolling on game screens:** at the default text size, every game screen fits **360 × 640** and larger with no scrolling at all. This covers Plan, Reveal, Potion, Hunter, Showdown, round summary, paused and game over. At text sizes above 100 %, only the middle area may scroll, and the bar and phase bar stay on screen. Non-game screens (Settings, History, Stats, About, How to play) may scroll. |
| 6 | **Changing screen** scrolls to the top and moves focus to the new screen's heading. |
| 7 | **The plan's target grid** is titled "Targets". There are **no manual deduction marks** and no "Mark" mode. *(Revised 2026-11-24: no ruled-out mark either; after the reveal the targets no longer matter, and each round is dealt afresh.)* The only mark is "In hand" on cards in your hand, always shown. A tap on a target card adds or removes it as a target during your plan. |
| 8 | **The discarded card is revealed at round end:** the face-down discard becomes public when the round ends, and the round summary shows it. Each round is dealt afresh, so this tells no one anything about later rounds. It changes §5.3 and the anti-goal list in §2, which forbids leaking the discard *during* the round. |
| 9 | **Cards show ability icons**, in our own icon language, not the physical cards' layout. The icon data comes from the engine. *(Revised by 11–12.)* |
| 10 | **Emphasis in game text:** player names (including "you") and character names are **bold**. Each marker word gets its small icon in front: Health, Cross, Fang, Hourglass, Badge and Potion. The word always stays, so the icon is never the only signal, and icons are hidden from screen readers. Nothing else is emphasised. |
| 11 | **Cards (2026-11-24):** one rounded parchment card at three sizes: large 120 × 176, medium 98 × 146 (hand), target 58 × 84. Initiative top left, one-line name centred, faction icon top right; a fixed-height art panel; one row of ability pills; ability text on large and medium only. Spec §8.3 "Card anatomy" has the details. |
| 12 | **Ability pills and tokens (2026-11-24):** a gain is a green-ringed marker token; an attack is a red pill: [cost token ▶] target shapes [: hearts]. No "+", swords, "?" or repeat mark. Every Cross, Fang, Hourglass and Potion, in pills, text and counts, sits on a round neutral token; Health and Badge stay bare. An ability legend goes in How to play and the in-game rules sheet. |
| 13 | **Plan screen B1 (2026-11-24):** targets as nine target cards (five then four) with pills; a card in your hand shows an "In hand" pill instead of its pills; your hand as overlapping medium cards along the bottom, the chosen one raised. Holding or keyboard-focusing any card shows it large. |
| 14 | **Home (2026-11-24):** no "Play on this device" or "Rejoin with PIN" on Home. New game offers playing on this device; Join game offers joining on this device, and leads to the seat and PIN when the room is full. The title is mixed case and centred with its emblem by the drawn letters. |

## Global Constraints

- **No git:** skip the Commit steps and put the suggested commit message in the report. Never touch real Cloudflare (`wrangler deploy --dry-run` only). Implementers never spawn subagents.
- **Verification:**
  - Engine: `cargo test --workspace --all-features`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo fmt --check`.
  - App: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`, `pnpm --filter @wwd/web e2e`, `e2e:online` (which includes the axe checks), `e2e:pwa`.
  - Visual: `pnpm --filter @wwd/web visual` (Task 1).
- **Matching the mockup:** each rendered screen matches its mockup in:
  - element order;
  - hierarchy (what is a bar, a panel, a primary button or a chip);
  - alignment;
  - the kind of control (segmented control, switch, select, mini card);
  - proportionate spacing.

  It doesn't have to match pixel for pixel. Each task report lists every deliberate difference, with the reason.
- **Engine rules and determinism:**
  - The engine stays the only authority on rules. Ability icons and plan legality come from engine data (`legal`, `validatePlan`, and Task 3's `abilitySummary`). No rule is encoded in the UI.
  - Engine determinism rules hold: no `HashMap`/`HashSet`, floats, clock, environment or locale. New event variants are appended last.
- **Ground rules (CLAUDE.md):**
  - Never colour alone. Switches show `ON` / `OFF` text.
  - Respect reduced motion; transitions take 300 ms or less.
  - Use a semantic DOM, one `h1` per screen and visible focus.
  - Every string comes from Fluent, in British English and sentence case. The unofficial notice stays on Home and in About.
  - Comments follow the rules: none by default, and no file paths.
- **IP:** character names are used as printed. Ability descriptions and icons are our own; the physical cards' layout and art are not used.
- **Mockup kit values** (from the mockup's CSS):

  | Element | Value |
  |---|---|
  | Panel | radius 12 px, padding 10 px (7 × 9 when tight), 1 px `--line` border, soft shadow |
  | Button | full width, padding 12 px, radius 10 px, 600 weight, 15 px. `primary` is filled `--accent`. `small` is inline, padding 8 × 12, 13 px. `danger` has a `--heart` outline; `danger solid` is filled |
  | Label | 11 px uppercase, letter-spacing 0.06 em, `--muted`, 4 px below |
  | Bar | gradient 160° from `--bar-a` to `--bar-b`; `--bar-ink` text; padding 10 × 12 px; a 22 px emblem before the title; 32 px icon buttons with radius 8 |
  | Body | gradient from `--surface-2` (55 %) to `--sky-glow` mixed with `--surface-2`; 12 px padding; 10 px gap (7 px when tight); a 120 px treeline at the bottom at `--scenery-o` opacity |
  | Phase bar | `--surface` with a top border, padding 10 × 12. Four step bars, 4 px tall, filled `--accent` when done. Step text 11 px uppercase muted; instruction 600 weight |
  | Cards | *(superseded by decision 11 and Task 5A)* large 120 × 176, medium 98 × 146, target 58 × 84 |
  | Chip | pill, `--chip` background, 12 px, 600 weight |
  | Note | 11.5 px, muted, with a 3 px `--warn` left rule |
  | Dialog | scrim `rgba(10,14,22,.55)`, radius 14 px, padding 14 px, 8 px gap, 17 px serif title, stacked full-width buttons |
  | Join code | 30 px monospace, letter-spacing 0.12 em, centred |

## Review Focus

1. **A long name or a larger text size:** a 24-character name, or text at 125 % or 150 %, must not overflow or overlap the bar, a card or the phase bar. Card names and pill rows never wrap or overflow at any text size, because cards are sized in rem. Tests: `layout survives 150% text and a 24-character name` (Task 13) and `card names and pills fit on one line at every size` (Task 5A).
2. **Very narrow screens:** at 320 px wide, no screen scrolls sideways, and on game screens the phase bar is still reachable. Test: `no horizontal overflow at 320 px` (Task 13).
3. **Short screens:** every game state fits 360 × 640 and 390 × 844 with no vertical scroll at 100 % text. Test: `game screens fit without scrolling` (Task 7, extended in Tasks 8–10).
4. **Text from every point of view:** every event message names the right player's character, read as yourself, as your opponent and in a neutral replay. Test: `every event names the right player's character from every perspective` (Task 3).
5. **Keyboard and screen readers:**
   - segmented controls and switches keep their roles;
   - sheets trap focus and give it back when they close;
   - the screen-reader text of game messages reads naturally, with no icon names and nothing read twice.

   Tests: `kit controls keep their roles` (Task 2), `sheets restore focus` (Task 7) and `rich text reads plainly` (Task 3).

---

### Task 1: The visual harness (gallery route and comparison capture)

**Files:**
- Create: `app/apps/web/src/gallery/{Gallery.svelte,fixtures.ts,entries.ts}`, `app/apps/web/scripts/visual.mjs`
- Modify: `src/router.ts`, `src/App.svelte` (dev-only `#/dev/gallery/<id>`), `app/apps/web/package.json` (`visual` script), `.gitignore` (`app/apps/web/visual-output/`)
- Test: `app/apps/web/test/gallery.test.ts`

**Interfaces (Produces):**
```ts
interface GalleryEntry { id: string; mockup?: 1|2|3|4|5|6|7|8|9; game: boolean; title: string; render: Component; props: Record<string, unknown> }
export const GALLERY: GalleryEntry[]
```
- **Dev only:** the route exists only when `import.meta.env.DEV`. A test proves the gallery isn't in the production bundle.
- **Fixtures:**
  - Entries render real screen and dialog components from fixture states: store snapshots, settings, sessions and history.
  - Game states come from seeded engine games built in `fixtures.ts`.
  - There are no network calls or other side effects.
  - `game: true` marks the entries that the no-scroll rule covers.
- **Entries** (mockup numbers in brackets):
  - Home, with Continue and the install card [1]
  - Home on first run
  - New game
  - Invite, waiting for the opponent [2]
  - Join
  - Display name prompt
  - Server confirmation
  - Rejoin with PIN
  - Local host
  - Local join
  - Table:
    - Plan [3]
    - Plan, with the seal confirmation
    - Reveal, hourglasses [4]
    - Reveal, potion
    - Showdown [5]
    - Hunter prompt
    - Round summary, with the discard
    - Paused
    - Rejoin request
    - Game menu sheet
    - Log and rules sheet
    - Continue on another device
    - Resign confirmation
  - Game over [6]
  - History [6]
  - Stats
  - Replay
  - Settings, top [7]
  - Settings, scrolled [8]
  - Delete all [9]
  - Clear history
  - Backup export
  - Backup import preview
  - About
  - How to play
  - Connection banners
  - Update banner
- **`scripts/visual.mjs`:**
  - It starts Vite and opens `docs/mockups/mockups.html` in Playwright Chromium.
  - It captures each mockup `.phone`.
  - It captures every gallery entry at 360 × 640, 360 × 740, 390 × 844 and 1280 × 800, in light, dark and high contrast, written to `visual-output/<id>/<size>-<look>.png`.
  - For each mapped entry it also writes `compare-<look>.png`: the mockup and the app side by side at 360 × 740.
  - It writes `visual-output/index.html` as a local contact sheet.

- [ ] **Step 1: Write failing tests:**
  - `every entry renders without errors`;
  - `gallery is absent from the production bundle`;
  - `entries cover every route and dialog`, checked against the router's route names and the dialog components.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `visual`. Expected: PASS. Copy `visual-output` to the plan workspace as `before/`.
- [ ] **Step 5: Commit.** `test(web): visual gallery and mockup comparison harness`.

---

### Task 2: The layout kit, app shell and rich text

**Files:**
- Create: `src/kit/{Panel,Label,Segmented,Switch,Select,Chip,Note,ListRow,Sheet,Scenery,Stepper,RichText}.svelte`, `src/kit/rich-text.ts`
- Modify:
  - `components/{AppBar,Screen,Button,ConfirmDialog}.svelte`
  - `theme/{tokens.css,base.css,fonts.ts}`
  - `themes/placeholder/{theme.json,scenery.svg}`
  - `settings/{Choice,Toggle}.svelte`, rebuilt on the kit
  - `src/App.svelte` (scroll reset and focus on route change)
- Test: `app/apps/web/test/kit/*.test.ts`

**Interfaces (Produces):**
- **`Screen`:** `{ title; back?: string; left?: Snippet; right?: Snippet; tight?: boolean; footer?: Snippet; fit?: boolean; children }`.
  - It renders the bar, the body with its treeline, and an optional fixed `footer` (the phase bar).
  - The column is centred and at most 30 rem wide.
  - `fit` marks a game screen: the body fills exactly the space between the bar and the footer, and at 100 % text nothing scrolls.
- **`AppBar`:** the mockup's bar.
  - The emblem sits before the title.
  - The left slot holds ← back or ☰ menu; the right slot holds ⚙ or ≡ log.
  - Icon buttons are drawn at 32 px, with a 44 px hit area.
- **`Button`:**
  - `variant`: `'default'|'primary'|'danger'|'danger-solid'`.
  - `size`: `'block'|'small'`.
  - An optional leading icon. Danger buttons always carry the `WarningIcon`.
- **Form controls:**
  - **`Segmented`:** a radio group drawn as the mockup's `.seg`.
  - **`Switch`:** `role="switch"`, with visible `ON` / `OFF` text.
  - **`Select`:** a native `<select>` styled as the mockup's.
  - **`Stepper`:** the mockup's − value + control.
- **`Sheet`:** a modal bottom sheet built on `<dialog>`. It traps focus and gives it back on close, closes on Escape, and has no motion under reduced motion.
- **Rich text (decision 10):**
  - `RichText` takes `parts: RichPart[]`.
  - `RichPart` is one of: `{text: string}`, `{player: string}` (bold), `{character: string}` (bold) or `{marker: Marker, label: string}` (icon plus word).
  - `richMessage(tr, id, args, kinds)` returns `RichPart[]`. It formats the Fluent message with marker tokens around each argument named in `kinds`, then splits it, so translations can move arguments freely.
  - The screen-reader text is the plain message.
- **Route change (decision 6):** the window scrolls to the top, and focus moves to the screen's `h1`.
- **Tokens and fonts:**
  - Add `--sky-glow`, `--scenery` and `--scenery-o` to every look.
  - Add Marcellus (`@fontsource/marcellus`, pinned exactly and at least two weeks old) at start-up for labels and titles.
  - The budget test must still pass.

- [ ] **Step 1: Write failing tests:**
  - `kit controls keep their roles`
  - `fit screens never scroll at 100% text`
  - `danger buttons carry the warning icon`
  - `every interactive kit element has a 44 px hit area`
  - `scenery is decorative`
  - `route change scrolls to top and focuses the heading`
  - `rich text bolds names and puts icons before markers`
  - `rich text survives reordered arguments`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, moving `Choice` and `Toggle` onto the kit.
- [ ] **Step 4: Run** the unit tests, lint, the e2e suites and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): mockup layout kit, app shell and rich text`.

---

### Task 3: Engine and game text, correct from every perspective

**Files:**
- Modify (engine):
  - `engine/crates/wwd-core/src/{event.rs,showdown.rs,game.rs,replay.rs,lib.rs}`
  - `engine/crates/wwd-core/src/targeting.rs` (ability data)
  - `engine/locales/en/engine.ftl`
  - `engine/crates/wwd-cli/src/render.rs`
  - `engine/crates/wwd-wasm/src/lib.rs`
  - `app/packages/engine/src/index.ts`
- Modify (app):
  - `app/packages/client-core/src/render-event.ts`, plus its `kinds` for rich text
  - `app/packages/client-core/locales/en/ui.ftl`, wherever game text lives
- Create: `app/apps/web/scripts/transcript.mjs`
- Test:
  - `engine/crates/wwd-core/tests/{events_text,discard_reveal,ability}.rs`
  - `app/packages/client-core/test/perspective.test.ts`
  - CLI golden tests

**Interfaces (Produces):**
```rust
EventKind::AttackHit { seat, target_seat, attacker: Character, character: Character, health_lost }  // `attacker` added
EventKind::DiscardRevealed { round: u32, character: Character }   // Public; appended last; emitted when the round ends
pub fn ability_summary(c: Character) -> AbilitySummary
pub struct AbilitySummary {
    pub gains: Vec<Marker>, pub spends: Option<Cost>, pub attack: Option<AttackShape>, pub damage: u8, pub optional_cross: bool,
}
// Cost / AttackShape mirror the existing attack_rule and the showdown effects; no new rules.
```
- **Attack event:** `AttackHit` gains `attacker`, the attacking seat's played character. `event-attack-hit` then reads, for example: "Your **Knight** hits your opponent's **Wolfen**! Your opponent loses 1 ❤ Health."
- **Discard reveal (decision 8):** the deal stores the discard. When the round ends, `DiscardRevealed` is emitted publicly.
  - `view()` keeps the discard hidden until then. After it, the round summary reads it from the event.
  - Update spec §2 (anti-goals: *during* the round), §5.3 step 1 and step 5, and §6.2.
  - Bump `ENGINE_VERSION`, because a replay now produces one more event per round.
- **Every message, every perspective:**
  - Audit every `event-*` message (and every `ui.ftl` message that takes seat or character arguments) as yourself, as your opponent and in a neutral replay.
  - Each character argument must belong to the seat its sentence says.
  - Fix any wording that reads wrongly.
  - Declare the `kinds` map, which says which argument is a player, a character or a marker, for every message.
- **`ability_summary` and `abilitySummary(character)`** (wasm/TS): structured data for the ability icons in Task 4. A test derives each summary from `attack_rule` and the showdown effects, so the two can't drift apart.
- **`scripts/transcript.mjs`:** plays three seeded full games, including a potion hit, a Hunter decline, a Wolf King short of Fangs, a forfeited attack and a resignation. It writes each game's log as yourself, as your opponent and in replay to `visual-output/transcripts/*.md`, for the owner to read.

- [ ] **Step 1: Write failing tests:**
  - `attack hit names the attacker and the victim`;
  - `discard is hidden during the round and revealed at round end`, with redaction checked for both seats before the reveal;
  - `ability summary agrees with the rules`;
  - `every event names the right player's character from every perspective`, run over every event kind, generated from fuzzed games, checking each rendered sentence against the event's seat-to-character facts;
  - CLI golden tests for the changed messages.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the client so it renders `discard_revealed`.
- [ ] **Step 4: Run** the engine verification, `pnpm -r build && pnpm -r test`, and `transcript.mjs`. Expected: PASS, with the transcripts written.
- [ ] **Step 5: Commit.** `fix(engine,client): game text names the right characters; reveal the discard at round end; ability data`.

---

### Task 4: Cards with ability icons

*Done. Its card face, ability row and mini cards are replaced by Task 5A; the sprite, popover and accessible names carry over.*

**Files:**
- Modify: `components/{CardButton,CharacterCard,TargetCard}.svelte`, `themes/placeholder/*` (new ability icons: attack, the faction targets, damage, cost, optional), `ui.ftl` (icon labels)
- Test: `test/components/cards.test.ts`

**Interfaces (Produces):**
- **Full-size cards** (74 × 100; 84 tall in the hand) show the mockup anatomy:
  - number at the top left (the Fool shows "–");
  - faction icon at the top right;
  - glyph in the centre;
  - name at the bottom.

  They also get a compact **ability row** built from `abilitySummary`:
  - gains, as marker icons;
  - attack, as an attack icon plus a count plus the target faction's shape (shield for Human, claw for Werewolf), with "any" shown as both;
  - damage above 1, as a ❤ count;
  - costs, such as a Fang per extra target;
  - the optional Cross, as a Cross with "?".
- **Mini cards** (44 × 58) keep only the number and glyph. On focus or long press they show the full card in a popover.
- **Accessible names are unchanged:** "3, Knight, Human. Gain an Hourglass; attack one Werewolf." The icons are decorative.
- **Factions** are never shown by colour alone: shape and pattern also differ, as before.

- [ ] **Step 1: Write failing tests:**
  - `ability row matches the engine summary for every character`;
  - `mini cards reveal the full card on focus`;
  - `card accessible names are unchanged`;
  - `cards match the mockup anatomy`, checking the number, faction icon, glyph and name positions.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): cards show their abilities as icons`.

---

### Task 5: Home (mockup 1), and the owner checkpoint

*Done, and the owner checkpoint is held. Task 5B removes Home's local and rejoin links and fixes the title.*

**Files:** modify `screens/Home.svelte` and `components/InstallCard.svelte`; test in `test/screens/Home.test.ts`.

**Layout,** following mockup 1:
- **Bar:** the title, with ⚙ on the right linking to Settings.
- **Continue panel:** shown only when there are sessions. Each row has the opponent's name and a muted status line: the round, your turn or paused, and when. It ends with a `small` Resume button, which is `primary` when it's your turn.
- **Main buttons:**
  - "New game", as a `primary` block;
  - "Join game", as a block;
  - "How to play" and "History", side by side in a row.
- **Install card:** a panel with a title and a ✕ dismiss button.
- **Footer:** a spacer, then the centred four-line footer.
- **Settings** is reached only from the bar's ⚙ button.
- **Other routes:** "Play on this device" (local host and join) and "Rejoin with PIN" become a `small` text-link row under the main buttons, so every route stays reachable.

- [ ] **Step 1: Write failing tests:**
  - `home follows the mockup order`;
  - `settings is reached from the bar`;
  - `local play and rejoin stay reachable`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, the e2e suites and `visual`. Expected: PASS.
- [ ] **Step 5: Owner checkpoint.** The controller stops and shows the owner:
  - the Home comparison images (light and dark);
  - the new cards (Task 4) beside mockup 3;
  - the transcripts from Task 3.

  It waits for approval or adjustments before Task 6.
- [ ] **Step 6: Commit.** `feat(web): home matches the mockup`.

---

### Task 5A: Cards, pills and marker tokens (design note; cards-and-plan sections H and I)

**Files:**
- Modify: `cards.ts` (`AbilityPill` replaces `AbilityItem`), `components/{CardFace,CardButton,CharacterCard,TargetCard,MarkerIcon}.svelte`, `kit/RichText.svelte` (tokens in text), `gallery/CardsGallery.svelte`, `themes/placeholder/*` (drop the icons no longer drawn: attack arrow, "?", cracked heart, unless still used elsewhere), `ui.ftl` (`card-in-hand`, the legend strings), and every caller of the old sizes (`MyArea`, `PlanSheet`, `RevealPanel`, `Replay`, `CharacterReference`, `DeductionTracker`)
- Create: `components/AbilityLegend.svelte`, `e2e/cards.spec.ts`
- Test: `test/cards.test.ts`, `test/components/cards.test.ts`, `test/components/MarkerIcon.test.ts`

**Interfaces (Produces):**
```ts
// cards.ts
export type TargetShape = Faction | 'any';
export type AbilityPill =
  | { kind: 'gain'; marker: Marker }
  | { kind: 'attack'; cost: Marker | null; targets: readonly TargetShape[]; damage: number };
export function pillsOf(character: Character): readonly AbilityPill[]; // cached per character, from abilitySummary
// CardFace / CardButton / CharacterCard / TargetCard
export type CardSize = 'large' | 'medium' | 'target'; // 7.5 × 11 rem, 6.125 × 9.125 rem, 3.625 × 5.25 rem
// TargetCard gains `inHand: boolean`; MarkerIcon gains `ring?: 'gain'`
// AbilityLegend.svelte: props { localiser }; used by Task 11 (How to play) and Task 7's rules sheet
```
- **Mapping from `abilitySummary`** (no rule lives in the UI; this only redraws the summary): gains become gain pills, in order. An attack becomes one pill whose `targets` repeats its shape `max ?? 1` times (`faction: null` → `'any'`), with `cost` from `spends: One(m)` and `damage` from `damage`. `spends: PerExtraTarget(m)` adds a second pill `{cost: m, targets: [shape], damage}` after the first. `optional_cross` is not drawn.
- **Card face** (spec §8.3): top row, art panel (fixed height per size; on target cards the name takes the top row, and the initiative and faction icon sit in the art panel's top corners), one row of pills, then text on large and medium. Names use `white-space: nowrap`, 10 px on medium. Pill padding is about 3 × 6 px with 4 px gaps on medium (2 × 3.5 px and 2 px on target).
- **Pills:** a gain is `MarkerIcon` with `ring="gain"` (green ring, no pill). An attack is a pill with `--heart` tint and outline: the cost token and ▶ only when `cost` is set, the shapes, then ": ♥♥" when `damage > 1`. The whole row is `aria-hidden`.
- **Tokens:** `MarkerIcon` draws Cross, Fang, Hourglass and Potion on a round neutral token (surface fill, thin ink ring). Health and Badge stay bare. `RichText` and marker counts get tokens through `MarkerIcon`, with no change of their own beyond spacing.
- **In hand:** a `TargetCard` with `inHand` shows a neutral "In hand" pill in place of its ability pills. The old tab tag above the card goes.
- **Inspect:** the existing popover shows the card at `large` size, for target and medium cards alike. Fix the carried minor: the "pointer used" flag is cleared on `keydown` as well as on blur, so Tab after a press opens the popover in Safari and Firefox on macOS.
- **Accessible names are unchanged.** "Text only" card text hides the glyph and the pills.

- [ ] **Step 1: Write failing tests:**
  - `pills match the engine summary for every character`, asserting exactly: hunter `[attack cross [werewolf, werewolf] 1]`; wolf_king `[attack null [human] 1, attack fang [human] 1]`; knight `[gain hourglass, attack null [werewolf] 1]`; wolfen `[gain hourglass, attack null [any] 1]`; seer `[attack null [werewolf] 2]`; witch `[gain potion]`; wolf_beauty `[gain fang, attack null [any] 1]`; villager `[gain cross]`;
  - `a gain is a ringed token, not a pill`;
  - `the attack arrow appears only with a cost`;
  - `a card in hand shows the In hand pill instead of its pills`;
  - `marker tokens wrap Cross, Fang, Hourglass and Potion but not Health or Badge`;
  - `card accessible names are unchanged`;
  - `ability legend shows gain, attack, damage and spend`;
  - `card names and pills fit on one line at every size` (Playwright, the cards gallery entry at 100 % and 150 % text: every `.name` has `scrollWidth <= clientWidth`; every pill row's children share one top and fit inside the row).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Callers switch sizes: hand `medium`, reveal and inspect `large`, target grid and Potion `target`. Layout of the screens themselves stays for Tasks 8 and 9.
- [ ] **Step 4: Run** the tests, the e2e suites and `visual`. Compare the cards gallery with cards-and-plan section H. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): cards, ability pills and marker tokens follow the design note`.

---

### Task 5B: Home simplified, joining by code covers rejoin, bar title alignment

**Files:**
- Modify: `screens/{Home,CreateOnline,JoinOnline}.svelte`, `components/AppBar.svelte`, `ui.ftl`
- Test: `test/screens/Home.test.ts`, `test/screens/CreateOnline.test.ts`, `test/screens/JoinOnline.test.ts`, `e2e/bar.spec.ts` (create, or extend Task 2's alignment test)

**Behaviour:**
- **Home** drops `home-local`, its sheet and `home-rejoin-online`, and their strings. The bar title reads "Werewolf: Duel! Online" in mixed case.
- **New game** gets a first `Segmented` row, "Play": "Online" (default) / "On this device". Creating with "On this device" navigates to `local-host`.
- **Join game** gets the same "Play" row above the code. Joining with "On this device" navigates to `local-join` with the code.
- **A full room:** when an online join is rejected with `room_full`, the error offers a `primary` "Rejoin with your PIN" button that opens `rejoin` with the same code and server (seat, then PIN).
- **Bar alignment:** the title's drawn letters (cap height to baseline) are centred on the emblem and icon buttons, not its line box. Use `text-box: trim-both cap alphabetic` where supported, with a fallback that gives the same result in the test browser.

- [ ] **Step 1: Write failing tests:**
  - `home has no local or rejoin links`;
  - `new game on this device opens the local host`;
  - `join on this device opens the local join with the code`;
  - `a full room offers rejoin with the same code`;
  - `bar title letters are centred on the emblem` (Playwright, every gallery entry with a bar: the ink box from `measureText` with the computed font, placed at the measured baseline, has its centre within 1 px of the emblem's centre).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the test ids of everything that stays.
- [ ] **Step 4: Run** the tests, the e2e suites and `visual`. Expected: PASS.
- [ ] **Step 5: Owner check.** The controller shows the owner the cards gallery beside section H, and Home in light and dark, then continues to Task 6 unless the owner asks for changes.
- [ ] **Step 6: Commit.** `feat(web): simpler home, join covers rejoin, bar titles centred`.

---

### Task 6: New game, Invite, Join, Rejoin, and local host and join (mockup 2 and the kit)

**Files:**
- Modify: `screens/{CreateOnline,JoinOnline,Rejoin,Host,Join}.svelte` and `components/{InvitePanel,DisplayNamePrompt,ServerConfirm,QrCode}.svelte`
- Tests: the existing screen tests, extended

**Layout:**
- **New game:**
  - A bar with ←, titled "New game".
  - A panel of `Segmented` rows:
    - "Play": Online / On this device (from Task 5B);
    - "Badge (first player)": Random / I start / Opponent starts;
    - "Reconnect grace": 5m / 10m / 30m;
    - an Advanced disclosure (tiebreak, minimum targets).
  - A `primary` "Create game" button.
- **Invite (mockup 2):**
  - A bar with ←, titled "Invite a friend".
  - A centred panel with:
    - the "Join code" label and the code;
    - the QR code;
    - `small` buttons for "Copy code" and "Share link" (`primary`).
  - The chosen options, shown as chips.
  - A status panel with a dot and the text "Waiting for your opponent…", which updates live.
- **Join and Rejoin:** a kit panel with the "Play" row (Task 5B), large monospace code entry and a `primary` action. Rejoin adds the seat choice (`Segmented`) and the PIN; it is reached from Join's full-room offer, Continue, and rejoin links.
- **Local host and join:** these mirror Invite and Join.
- **Display name prompt and server confirmation:** these become kit dialogs, styled as in Task 12.

- [ ] **Step 1: Write failing tests:**
  - `new game uses segmented controls with the rules defaults`;
  - `invite follows the mockup order`;
  - `join and rejoin use the kit panel`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests, both e2e suites and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): new game, invite and join match the mockups`.

---

### Task 7: The table frame, fitting one screen

**Files:**
- Modify: `screens/Table.svelte`, `table/{OpponentStrip,MyArea,PhaseBar,GameMenu,LogDrawer,MarkerList,TableArea}.svelte`, `components/ConnectionBanner.svelte`
- Test: `test/table/frame.test.ts`, `e2e/layout.spec.ts` (created here; extended in Tasks 8–10 and 13)

**Layout (mockups 3–5):**
- **The table is a `Screen` with `fit`.**
- **Bar:**
  - left: ☰ opens the `GameMenu` as a `Sheet`;
  - title: "Round N", becoming "Round N · Showdown" during the showdown;
  - right: ≡ opens the log and rules as a `Sheet`.
- **Removed:** the old "Table" heading, "Status: Playing", the inline game menu, the inline log, the "In play" panel and the separate initiative panel. Their content moves into the strips, the phase panels, the phase bar or the sheets.
- **Opponent strip:** a panel with:
  - the name;
  - the connection state, as a dot plus text;
  - the opponent's markers;
  - a chip for their plan status, or what we're waiting for.
- **My strip:** a spread row at the bottom of the body, with my markers, a Badge chip and "You".
- **Phase bar:** the `Screen` footer, containing:
  - four step bars (Plan, Reveal, Potion/Showdown, Round over);
  - the step text;
  - the instruction;
  - the primary action.
- **Middle area:** the space between the strips holds exactly one phase panel set at a time (Tasks 8–10).
- **Connection banner:** a slim strip under the bar.

- [ ] **Step 1: Write failing tests:**
  - `table bar shows the round with menu and log buttons`;
  - `game screens fit without scrolling` (Playwright, every `game: true` gallery entry, at 360 × 640 and 390 × 844: `document.scrollingElement.scrollHeight <= innerHeight`, and the phase bar's primary action is inside the viewport);
  - `sheets restore focus`;
  - `no status text duplicates the opponent strip`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the e2e driver for the menu and log sheets. Keep the test ids.
- [ ] **Step 4: Run** all the e2e suites, the unit tests and `visual`. Expected: PASS for the frame. Phase panels that still overflow are marked `test.fixme` with the task that fixes them.
- [ ] **Step 5: Commit.** `feat(web): table frame fits one screen`.

---

### Task 8: The plan phase (mockup 3)

**Files:**
- Modify: `table/{PlanSheet,DeductionTracker}.svelte` (renamed `TargetGrid.svelte`), `table/deduction.ts`
- Tests: the existing plan tests, plus `test/table/targets.test.ts`, which replaces the deduction tests

**Layout (decision 13; cards-and-plan section I is the binding reference, not mockup 3):**
1. **Opponent strip** (Task 7), then:
2. **"Targets" panel** (decision 7): the nine `target`-size cards, five then four, centred.
   - During your plan, tapping one adds or removes it as a target, but only if `legal` allows it. Chosen targets get the accent outline and a tick over the art.
   - Cards that can't be targeted are dimmed, with the reason (from `validatePlan`) on focus or tap.
   - Cards in your hand show the "In hand" pill (Task 5A). There are no manual marks.
3. **Your hand:** the 3–4 `medium` cards overlapping along the bottom of the middle area (about 30 px overlap), centred. Tapping one chooses it; the chosen card rises 14 px with the accent outline.
4. **My strip** (Task 7).
5. **Phase bar:** the instruction is the plan summary in rich text ("**Knight** → **Wolfen** + **Fool**", or "Choose a character" before one is chosen), then "Seal plan", with the confirmation when that setting is on.

- The separate "Choose a character" list, the "Your plan" panel and the ability `Note` go away: the chosen card shows its ability, and holding any card shows it large.
- `deduction.ts` goes: the only mark left is "In hand", computed from your hand and always on. The ruled-out state, its styles, the cards gallery's "Ruled out" section and the "Deduction auto-mark" setting are removed (stored settings ignore the old key).
- Update spec §8.1 (the deduction tracker becomes the "In hand" mark only) and §8.2 (remove "Deduction auto-mark").
- The plan fits on one screen at 360 × 640. Measured on the section I mockup, the content needs about 40 px more than 640, which putting the summary in the phase bar (instead of under the grid) and the tight body spacing (7 px gaps, tight panels) recover. If it still doesn't fit, reduce the hand's rise and the overlap before touching card sizes, and say so in the report.

- [ ] **Step 1: Write failing tests:**
  - `tapping a hand card chooses the character`;
  - `the chosen hand card rises`;
  - `tapping a target card toggles it only when legal`;
  - `targets panel has no manual marks`;
  - `plan summary is the phase bar instruction in rich text`;
  - add the plan entries to `game screens fit without scrolling`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Update the e2e driver if needed. Keep `plan-character-*`, `target-*` and `seal-plan`.
- [ ] **Step 4: Run** all the e2e suites, the unit tests and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): plan phase matches the mockup and fits one screen`.

---

### Task 9: Reveal, Potion, Hunter, Showdown, round summary and paused (mockups 4 and 5)

**Files:**
- Modify: `table/{RevealPanel,ShowdownList,RoundSummary,PausedPanel,InitiativeTrack}.svelte`
- Tests: the existing tests, extended

**Layout:**
- **Reveal (mockup 4):**
  - A centred panel: the opponent's face-down card, "vs", then my card (`medium`, or `large` if it fits 360 × 640; the face-down card matches its size).
  - A "Spend hourglasses" panel:
    - the `Stepper`, with "**Knight** initiative 3 → 2" aligned right;
    - a 0–8 track with ▲ at my slot;
    - a `Note` giving the game's tiebreak.
- **Potion:** the same panel style, using the `target`-size cards.
- **Hunter prompt:** shown inline.
- **Showdown (mockup 5):**
  - The two plan panels (`target`-size card plus rich-text summary) **replace** the reveal panels; nothing stacks underneath. Each shows that seat's character **and its targets** (from the reveal onwards, on Reveal, Potion, Hunter and Showdown), since Task 7 moved them out of the old table area.
  - An `ol` of results in rich text: `done` steps are dimmed, the `now` step has an accent outline, and eliminated characters are struck through.
  - A compact health summary panel.
  - "Next round" on the phase bar.
  - When the list is longer than the middle area allows, only the earlier steps collapse to one line each, so the screen never scrolls.
- **Round summary:**
  - The round's results, collapsed.
  - The **card set aside** (decision 8): "Set aside this round: **Seer**", shown as a `target`-size card.
  - The Badge passing.
- **Paused:** a panel in the same style.

- [ ] **Step 1: Write failing tests:**
  - `reveal shows the face-down card against mine`;
  - `showdown replaces the reveal panels`;
  - `showdown steps are styled done, now and out` (checked by class and text);
  - `round summary shows the discarded card`;
  - `long showdown lists collapse rather than scroll`;
  - add these entries to `game screens fit without scrolling`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the e2e suites, the unit tests and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): reveal and showdown match the mockups and fit one screen`.

---

### Task 10: Game over, History, Stats and Replay (mockup 6)

**Files:**
- Modify: `table/GameOver.svelte`, `screens/{History,Stats,Replay}.svelte`
- Tests: the existing tests, extended

**Layout:**
- **Game over:** this fits one screen.
  - A bar with ←, titled "Game over".
  - A centred result panel: the big line, then how the game was won (muted), then the markers.
  - A row with "View replay" (`primary`) and "Rematch".
  - A History panel: the summary row and the last three games as list rows, each with a `small` Replay button.
- **History:** list rows for every game, a summary row, and a link to Stats.
- **Stats:** panels with label headings.
- **Replay:**
  - A bar with ← and "Replay".
  - A `Segmented` control for My view / Full.
  - The table panels from Tasks 7–9 at that step's state, fitting one screen.
  - A footer with the step controls: ⏮ ◀ "Step 12 of 40, round 3" ▶ ⏭.
  - The log of the current step in rich text.

- [ ] **Step 1: Write failing tests:**
  - `game over follows the mockup order`;
  - `history rows show result, opponent and replay`;
  - `replay controls sit in the footer`;
  - add game over and replay to `game screens fit without scrolling`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the e2e suites, the unit tests and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): game over and history match the mockup`.

---

### Task 11: Settings, About and How to play (mockups 7 and 8)

**Files:**
- Modify: `screens/{Settings,About,CharacterReference}.svelte`, `settings/SettingsGroup.svelte`
- Tests: the existing tests, extended

**Layout:**
- **Settings (mockups 7 and 8):**
  - A bar with ←, titled "Settings", and a tight body.
  - Each group is a panel with an uppercase label.
  - Each setting is a row with the name on the left and the control on the right.
  - Groups and their controls:

    | Group | Controls |
    |---|---|
    | General | Language (`Select`), Theme (`Segmented`), Display name, Install app |
    | Reading & accessibility | Text size (`Segmented`: 90 %, 100 %, 125 %, 150 %, replacing the 10 % stepper; record this in spec §8.2), Reading font (`Segmented`), High contrast, Colour-blind patterns, Reduced motion, Showdown speed, Haptics |
    | Gameplay | Switches ("Deduction auto-mark" is removed in Task 8) |
    | Network | Server (`Select`: Default / Custom…, which reveals a field) |
    | Data | The note; Backup with `small` Export and Import buttons; Clear history and Delete all data as `small danger` buttons |
    | About | "Version x.y.z", "Credits" and "Licences" links to About, and "© 2026 David F Dev" |
- **About:** the same style.
- **How to play:** the `AbilityLegend` (Task 5A) first, then the character reference as list rows: a `medium` card plus the ability in rich text. M5 replaces it with the rulebook.
- **In-game rules sheet:** the ≡ sheet (Task 7) also shows the `AbilityLegend`.

- [ ] **Step 1: Write failing tests:**
  - `settings rows put the control on the right`;
  - `how to play and the rules sheet show the ability legend`;
  - `text size offers the four mockup presets`;
  - `data actions are danger buttons with the warning icon`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the e2e suites, the unit tests and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): settings match the mockups`.

---

### Task 12: Every dialog, sheet and banner (mockup 9 style)

**Files:**
- Modify: `components/{ConfirmDialog,DeleteDataDialog,BackupPreview,RejoinRequest,ContinueElsewhere,ResignButton,UpdateBanner,ConnectionBanner,DisplayNamePrompt,ServerConfirm}.svelte`, plus the seal-plan confirmation
- Tests: the existing dialog tests, extended

**Style (mockup 9):**
- **Dialogs:**
  - A scrim behind a 14 px-radius surface.
  - A serif title. Destructive dialogs put the warning icon in the title.
  - The body is 13 px, using lists wherever the dialog names things.
  - The buttons are stacked full-width blocks: a safe alternative first (for example "Export backup first"), then the primary or destructive action, then Cancel.
  - The dialogs keep `showModal`, closing on Escape, and focus capture and restore.
- **Sheets** (the game menu and log) use the same surface and type.
- **Banners** are slim strips under the bar: an icon, the text, and an action where there is one. On a game screen, while a connection banner is shown the middle area may scroll (the bar and phase bar stay); take `connection-banners` off the layout test's unfinished list with that rule.

- [ ] **Step 1: Write failing tests:**
  - `dialogs stack their actions with cancel last`;
  - `destructive dialogs title with the warning icon`;
  - `banners sit under the bar`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the e2e suites, the unit tests and `visual`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): dialogs, sheets and banners match the mockup`.

---

### Task 13: Consistency sweep, robustness and docs

**Files:**
- Modify:
  - `e2e/layout.spec.ts` and `e2e/a11y.spec.ts` (adding the gallery entries);
  - whatever the sweep finds;
  - spec §8 (screens, settings, visual language, fonts and text emphasis);
  - `docs/mockups/mockups.html` (a note that the app's gallery is the living reference for screens the mockups don't show);
  - `CLAUDE.md` (the `visual` and `transcript` commands).

**The sweep:** run `visual`, then compare every entry against its mockup, or against the kit where it has no mockup. Fix any inconsistency in:
- spacing;
- label case;
- which button is primary;
- icon sizes;
- use of panels;
- bar contents;
- rich-text use.

Remove any `test.fixme` left over from Task 7.

**Carried into the sweep** (from earlier task reviews; the ledger lists them):
- the bar stays put (sticky) on every screen that scrolls, as it does on game screens;
- a replay entry with a long log, proving the replay log scrolls inside itself;
- Game over's phase-bar instruction only after a final showdown;
- the `-0.25em` token fallback for browsers without the `cap` unit, and contrast of nested muted text in dimmed showdown rows;
- the plan section's 7 px gap against the screen's 6 px;
- a replay unit test that times out under the full suite.

**Robustness tests** (`layout.spec.ts`, over every gallery entry):
- `no horizontal overflow at 320 px`;
- `layout survives 150% text and a 24-character name`, checked by bounding boxes: no clipped or overlapping bar, card or phase bar, and on game screens only the middle scrolls;
- `the bar and phase bar never cover focused elements`.

The axe checks also run on the gallery entries, in light, dark and high contrast.

- [ ] **Step 1: Write the tests.**
- [ ] **Step 2: Run them.** Expected: FAIL wherever the sweep has work to do.
- [ ] **Step 3: Fix and document.**
- [ ] **Step 4: Run everything**, including `visual` and `transcript`. Copy `visual-output` to the workspace as `after/`.
- [ ] **Step 5: Owner review.** Publish a before-and-after gallery of every screen and dialog, in light and dark, with the mockup beside each mapped screen, plus the final transcripts. It is a private artifact for the owner, reviewed before the final review of the whole pass.
- [ ] **Step 6: Commit.** `feat(web): layout consistency sweep; docs`.

---

### Task 14: Owner tweaks after the gallery review (2026-11-25)

**Decisions (owner-approved):**
1. **Play choice:** rename "On this device" to "This device" on New game and Join game. Each screen shows one one-line hint, only for the selected option. New game: Online "Play a friend anywhere with a join code."; This device "Two tabs of this browser, to try the game out." Join game: Online "Enter the code your friend shared."; This device "Enter the code shown in the other tab."
2. **Invite:** remove "Continue on another device" from the Invite screen (it stays in the game menu).
3. **Opponent strip:** the Badge pill sits right-aligned on the second row, under the plan-status pill.
4. **Waiting indicator:** a small spinner (decorative, `aria-hidden`; a steady dot under reduced motion) after "Waiting for your opponent…" in the phase bar, and wherever the app waits on another person or the network: connecting/reconnecting banner, Join while connecting, Invite's waiting status, the wait after sealing a plan or placing Hourglasses until the referee confirms, and "Resume from save" while the room is created.
5. **Showdown plan panels:** the order reads on two lines, "Second" then "Initiative 3", neither wrapping.
6. **Round summary:** "Set aside: **Seer**" (the log line "The card set aside in round N was…" is unchanged).
7. **Programmatic focus:** headings that receive focus on screen or phase change (`tabindex="-1"`) show no focus outline; focus still moves there.
8. **Game menu:** the unofficial notice is centred.
9. **Bare icons** (Health, Badge) are centred like the marker tokens wherever they sit beside them.
10. **Game over:** remove the rematch hint ("Play again in the same room…") and the record-check line ("The game record was checked…").
11. **Replay:** hand cards never rise (the first card was raised).
12. **Ability legend:** each icon is centred on the first line of its text.

**Tests:** one per behaviour (hint per selection; no ContinueElsewhere on Invite; Badge right-aligned; spinner present with the waiting text and static under reduced motion; two-line order with no wrap; "Set aside:" label; no outline on programmatically focused headings while keyboard focus on controls still shows one; centred notice; bare icon centres within 1 px of token centres; Game over has no hint lines; replay cards share one top; legend icon centred on its first line). Update spec §8 where these change it.

---

### Task 15: Auto-fit one-line labels (2026-11-25, after CI)

**Why:** on Ubuntu CI, "Wolf Beauty" overflowed its medium card by a fraction of a pixel (font rendering differs from Windows). Labels that must stay on one line should fit by measurement, not by pixel budgets, which also covers the DE and JA names in M5 and every text size.

**Decisions (owner-approved):**
- A reusable fit action (a Svelte action) shrinks a one-line label's font size in small steps until it fits its box, from its normal size down to a floor of 80 % of it; below the floor the label ends in "…" and the full text stays in the accessible name or `title`. It re-measures on resize, on the text-size setting changing and once fonts have loaded; never per frame.
- Applied to: card names at every size (the trigger); bar titles; `Segmented` option labels; chips in the opponent strip and my strip (plan status, Badge); phase-bar action buttons; the plan panels' "Second" / "Initiative N" lines; player names in the strips (fit first, then the existing ellipsis).
- Not applied to running text, the log, dialogs or anything allowed to wrap.

**Tests:** the card test becomes "every name fits its slot and is at least the floor size" at 100 % and 150 %; a short name ("Seer") stays at full size; the fit action has unit tests (shrinks when too wide, stops at the floor then ellipsis, restores when there is room again); each label group above gets one fit assertion in the layout suite.
