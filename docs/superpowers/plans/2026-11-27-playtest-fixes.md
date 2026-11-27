# Playtest Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix what the 2026-11-26 playtest found: in-hand targets become illegal, the target grid gets clearer, the hand drops a deselected card back into place, the strips and the reveal/showdown panels get tidier, and marker counts change on the step that reads the change out.

**Architecture:**
- One engine change: two rules, a remembered dealt hand, version 0.3.0. The protocol goes to version 4.
- Then three web tasks on the existing Svelte table components:
  - the plan screen and the hand;
  - the markers;
  - a shared player-side component for the reveal and showdown panels.

**Tech Stack:** Rust (`wwd-core`, `wwd-cli`, `wwd-wasm`), Fluent, Svelte 5, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-27-playtest-fixes-design.md` (approved). Background: spec `docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md` §5.3, §6.2, §6.4, §8.1.

## Global Constraints

- No git state changes by Claude; the owner commits.
- The engine stays deterministic: no `HashMap`/`HashSet`, floats, clock or locale. No display strings; the engine emits ids. Every rule maps to a named test.
- All new text goes in Fluent, in EN, DE and JA, in the same task that adds it. Sentence case, British English. German uses du; Japanese counts markers with 個.
- Game screens fit 360 × 640 and 390 × 844 at 100 % text with no scrolling, don't scroll sideways at 320 px, and stay whole at 150 % text with 24-character names, in every language and the pseudo-locale.
- Never information by colour alone. Reduced motion is respected. Animations are CSS only, with no per-frame JavaScript or allocation.
- Comments follow CLAUDE.md: one-line `//`, no file paths, no dependent comments.
- Playwright suites run one at a time. Never touch Cloudflare.

## Review Focus

1. **Reconnecting or reloading mid-showdown.**
   - Expected: the marker rows show the state at the step on screen.
   - Expected: no burst of animations for changes that happened before the page loaded.
   - Covered by Task 3: `a reload mid-showdown shows the counts at the shown step without animating`.
2. **Switching characters back and forth** (Villager → Knight → Witch, with a Fool the player chose themselves).
   - Expected: only the Fool the app chose is cleared, and a Fool the player chose survives every switch.
   - Covered by Task 2: `a Fool the player chose survives switching characters`.
3. **The Badge holder's hand of four, at 150 % text.**
   - Expected: five targets, laid out as three and two, never scrolling sideways at 320 px.
   - Covered by Task 2's layout entries `table-plan-badge-hand` and `table-plan-villager`.
4. **A Wolf King with five targets** in the Potion step and the showdown.
   - Expected: two rows of chips, then "+n", with the full list in the accessible name.
   - Expected: the screen still fits 360 × 640.
   - Covered by Task 4: `five targets show two rows and +n` and the gallery entry `table-showdown-wolf-king-five`.
5. **Stepping backwards in a replay.**
   - Expected: the counts match the step shown, and stepping back never leaves a count from a later step.
   - Covered by Task 3: `replay counts follow the step in both directions`.

---

### Task 1: The engine rules, version 0.3.0 and protocol 4

**Files:**
- Modify (engine):
  - `engine/crates/wwd-core/src/state.rs`: `PlayerState` gains `dealt: Vec<Character>`.
  - `apply.rs`: deal and `submit_plan` validation.
  - `edit.rs`: `SetHands` also sets `dealt`.
  - `legal.rs`: `plan_actions` and the `RevealPotion` arm.
  - `types.rs`: new `RuleError` variants.
  - `replay.rs`: `COMPATIBLE_ENGINE_VERSIONS = ["0.1.0", "0.2.0"]`.
  - `engine/crates/*/Cargo.toml`: version 0.3.0.
  - `engine/locales/{en,de,ja}/engine.ftl`: the two error messages.
- Modify (app):
  - `app/packages/protocol/src/codes.ts`: `PROTOCOL_VERSION = 4`.
  - The engine package's generated types and WASM, by rebuilding.
  - `app/apps/web/src/screens/Replay.svelte`: a replay that fails to verify shows `replay-unplayable`, not `replay-missing`.
  - `app/packages/client-core/locales/{en,de,ja}/ui.ftl`: `replay-unplayable`.
- Modify (docs): spec §5.3 (the plan targets line and Reveal C), §6.2 (engine versions), §6.4 (the protocol-version table row for 4).
- Test:
  - `engine/crates/wwd-core/tests/` (the existing rules test files);
  - `app/apps/web/test/screens/Replay.test.ts`;
  - the protocol and referee tests that pin the version.

**Interfaces:**
- Produces:
  - `RuleError::TargetInHand`, id `error-target-in-hand`, with EN text "You can't target a card in your own hand."
  - `RuleError::PotionTargetInHand`, id `error-potion-target-in-hand`, with EN text "The Potion can't name a card that was in your hand this round."
  - `PlayerState.dealt`: this round's hand as dealt. It is not in the view, since the view already carries `hand`.
  - `ENGINE_VERSION` 0.3.0; `PROTOCOL_VERSION` 4.
- Fluent (`ui.ftl`): `replay-unplayable` = "This game was played under older rules and can't be replayed." In DE and JA, write it in the project's style.

- [ ] **Step 1: Write the failing engine tests** (names as given):
  - `plan_cannot_target_a_card_in_hand`: `legal_actions` in Plan lists no plan whose targets include a hand character. `apply` of such a plan returns `RuleError::TargetInHand`.
  - `plan_may_still_target_the_fool`: Villager → Fool stays legal.
  - `potion_cannot_name_a_dealt_card`: covers the played character and a discarded one. Both are absent from `legal_actions`, and `apply` returns `PotionTargetInHand`.
  - `potion_may_name_own_plan_target`: a holder who targets the Wolfen may name the Wolfen with the Potion.
  - `potion_always_has_a_target`: the fuzz invariant "a pending seat has a legal action" holds over the existing fuzz seeds, plus a hand-built case (no Badge, a hand of Wolf King, Wolfen and Wolf Beauty, the Wolf King aimed at all five Humans). The Potion then has exactly five legal targets: the five Humans.
  - `replay_from_0_2_0_without_in_hand_targets_verifies` and `replay_from_0_2_0_with_an_in_hand_target_fails`: build each by recording a game with the version string set to 0.2.0.
  - `set_hands_edit_sets_dealt`.
- [ ] **Step 2: Run `cargo test --workspace --all-features`.** Expected: the new tests fail.
- [ ] **Step 3: Implement the rules, `dealt`, the version bump and the compatible list.** `dealt` is set at the deal and by `SetHands`, cleared at round start, and hashed.
- [ ] **Step 4: Run `cargo test`, `cargo clippy … -D warnings` and `cargo fmt --check`.** Expected: all pass. Then run the CLI's fuzz test target.
- [ ] **Step 5: The app side.**
  - Rebuild the engine package (`pnpm build`).
  - Bump `PROTOCOL_VERSION` to 4 and update every test that pins it.
  - Add `replay-unplayable`.
  - In `Replay.svelte`, show it when `replay()` throws for a stored game. A missing record keeps `replay-missing`.
  - `Replay.test.ts`: `a stored game that fails to verify says it can't be replayed`.
- [ ] **Step 6: Run `pnpm test` and `pnpm lint`.** Expected: all pass, including the locale completeness check.
- [ ] **Step 7: Update the spec.**
  - §5.3: replace the plan-targets line with the rule.
  - §5.3 Reveal C: the Potion names "any character not in their hand this round"; own plan targets are allowed.
  - §6.2: 0.3.0 and the compatible list.
  - §6.4: a row for protocol 4, giving the reason.

### Task 2: The plan screen and the hand

**Files:**
- Modify:
  - `app/apps/web/src/table/TargetGrid.svelte`: hide hand cards; three to a row at 5 % larger; the faded state.
  - `app/apps/web/src/components/CardButton.svelte`:
    - a `faded` look for disabled target cards: no cross, 60 % opacity, 90 % size;
    - the medium selected lift goes from `-14px` to `-7px`;
    - raise only when selected, previewed or `:focus-visible`.
  - `app/apps/web/src/table/HandFan.svelte`: replace `li:focus-within { z-index: 1 }` with the rule above.
  - The plan builder in `app/apps/web/src/table/PlanSheet.svelte` (or wherever the plan state lives): the auto-Fool.
  - `app/apps/web/src/table/targets.ts`.
- Remove: the "In hand" pill from `TargetCard`, and its Fluent message if nothing else uses it.
- Gallery: update `table-plan`, `table-plan-long-name`; add `table-plan-none-chosen`, `table-plan-badge-hand` (four cards in hand), `table-plan-villager`.
- Spec: §8.1, the deduction-tracker note.
- Test: `app/apps/web/test/table/TargetGrid.test.ts`, `test/table/plan-builder.test.ts`, `e2e/cards.spec.ts`, layout and wide coverage through the gallery.

**Interfaces:**
- Consumes: Task 1's legal actions. Which targets can be chosen still comes from `legal_actions()`.
- Produces: `TargetGrid` props unchanged except that `hand` now hides cards instead of marking them. `CardState` gains no new value: `'disabled'` draws faded on target cards.

- [ ] **Step 1: Write the failing tests.**
  - `TargetGrid.test.ts`:
    - `cards in the hand are not shown`: with a hand of Knight, Witch and Villager, six targets render.
    - `nothing is faded before a character is chosen`.
    - `targets the chosen character can't use are faded, not crossed`: they have `aria-disabled`; the frame has no `::after` cross.
  - `plan-builder.test.ts`:
    - `choosing the Villager chooses the Fool`, and the same for the Witch.
    - `switching away clears a Fool the app chose`.
    - `a Fool the player chose survives switching characters`.
    - `with min_targets 0 nothing is chosen for you`.
  - `cards.spec.ts`:
    - `a deselected hand card goes back under its neighbours`: tap the Knight twice, and its `li`'s computed `z-index` equals its neighbours'.
    - `the chosen card rises 7 px`.
    - `the Potion picker offers no card from this round's hand, but offers your own target`. The picker is already drawn from the legal actions, so it follows Task 1. This test pins that.
- [ ] **Step 2: Run them.** Expected: they fail.
- [ ] **Step 3: Implement.** Faded uses `opacity: 0.6; scale: 0.9` with `transform-origin: center`, so the grid doesn't move. The auto-Fool is UI state: a flag set when the app adds the Fool.
- [ ] **Step 4: Update the gallery entries** and run `pnpm test`, then `pnpm --filter @wwd/web e2e`. Expected: all pass, in every language and the pseudo-locale.
- [ ] **Step 5: Update spec §8.1's deduction-tracker note:** hand cards are hidden from the target grid; there is no "In hand" pill.

### Task 3: Markers: the Potion count, timing and animation

**Files:**
- Create:
  - `app/apps/web/src/table/shown-markers.ts`;
  - `app/apps/web/src/components/MarkerCount.svelte`, a count that animates when its value changes.
- Modify:
  - `app/apps/web/src/table/MarkerList.svelte`: Potion as a count; no "Hourglasses placed" item; uses `MarkerCount`.
  - `app/apps/web/src/table/ShowdownList.svelte`: reports how many steps are shown.
  - `app/apps/web/src/screens/Table.svelte` and `OpponentStrip.svelte` / `MyArea.svelte`: pass the shown counts.
  - `app/apps/web/src/screens/Replay.svelte`: counts follow the step.
  - The `count-placed` Fluent message is removed if unused.
- Test: `app/apps/web/test/table/shown-markers.test.ts`, `test/components/MarkerCount.test.ts`, `e2e/showdown.spec.ts` (or the existing showdown e2e file).

**Interfaces:**
- Produces:
  - `interface Markers { health: number; cross: number; fang: number; hourglass: number; potion: boolean }`
  - `shownMarkers(players: readonly [Markers, Markers], steps: readonly SequencedEvent[][], shown: number): readonly [Markers, Markers]`: the live counts, with the effects of steps `shown..` undone. It is pure, and works from the `marker_gained`, `marker_spent`, health-loss and Potion events in those steps.
  - `ShowdownList` prop `onStepsShown?: (shown: number, total: number) => void`.
  - `MarkerCount.svelte` props: `{ value: number; marker: Marker; animate: boolean }`. It animates only when `value` changes after mount and `animate` is true.
- Fluent: none new. The "+n" and "−n" labels are `aria-hidden`; the count's accessible name stays as today.

- [ ] **Step 1: Write the failing tests.**
  - `shown-markers.test.ts`:
    - `step 0 undoes every gain and loss of the showdown`.
    - `each step applies only its own events`.
    - `all steps shown equals the live counts`.
    - `the Potion is back with its holder until its step`.
  - `MarkerCount.test.ts`:
    - `no animation on first render`.
    - `a rise adds the gain class and +1`.
    - `a fall adds the loss class and −1`.
    - `reduced motion uses the still highlight`.
  - e2e:
    - `the opponent's Hourglass count rises on the step that reads it out`.
    - `a reload mid-showdown shows the counts at the shown step without animating`.
    - `replay counts follow the step in both directions`.
    - `the Potion shows as 1`.
- [ ] **Step 2: Run them.** Expected: they fail.
- [ ] **Step 3: Implement.**
  - During a showdown, the table computes `shownMarkers` from `showdownSteps(events)` and the shown count. With "instant", or once every step is shown, it uses the live counts.
  - Glow and slide:
    - a gain is the `--ok` colour family, a loss the `--heart` family;
    - the count moves for 0.45 s with an ease-out, and the glow fades over 1.2 s;
    - with reduced motion, a static ring shows for 1.2 s.
  - Check the colours in light, dark and high contrast.
- [ ] **Step 4: Run `pnpm test`, `e2e` and `e2e:online`.** Expected: all pass. The gallery gains `table-marker-gain` and `table-marker-loss` (frozen mid-animation through a gallery-only flag).

### Task 4: The shared player side for the reveal and showdown

**Files:**
- Create: `app/apps/web/src/table/PlayerSide.svelte`.
- Modify:
  - `app/apps/web/src/table/RevealPanel.svelte`: the versus area uses two `PlayerSide`s; the "Placed n Hourglasses" caption goes.
  - `app/apps/web/src/table/PlanPanels.svelte`: the showdown header uses two `PlayerSide`s, ordered by `plans_revealed.order`.
  - Fluent `ui.ftl` (three languages): `side-you`, `side-opponent`, `side-initiative`, `side-initiative-changed`, `side-initiative-hidden`, `side-target`, `side-more-targets`, `side-placed` (the pill's accessible name).
  - Remove the plan-panel messages the old layout used, if unused.
- Gallery:
  - update `table-reveal-hourglasses`, `table-reveal-potion`, `table-showdown`, `table-showdown-elimination`, `replay-showdown`;
  - add `table-reveal-opponent-zero`, `table-showdown-wolf-king-five`.
- Test: `app/apps/web/test/table/PlayerSide.test.ts`, layout, wide and axe coverage through the gallery.

**Interfaces:**
- Consumes: Task 3's `MarkerCount` is not used here. The Hourglass token comes from `MarkerIcon`.
- Produces:
  - `PlayerSide.svelte` props:
    ```ts
    {
      localiser: Localiser;
      who: 'you' | 'opponent';
      /** null while face down */
      character: Character | null;
      initiative: { printed: number; effective: number } | null;
      /** null shows the pill instead */
      targets: readonly TargetCard[] | null;
      /** the pill's state */
      placed: number | 'choosing' | null;
    }
    ```
  - The side's accessible name holds who, the character, the initiative and every target.

- [ ] **Step 1: Write the failing tests** in `PlayerSide.test.ts`:
  - `shows You or Opponent and the initiative on one line each`;
  - `a changed initiative reads 4 → 3`;
  - `a face-down side reads Initiative ? and shows the pill`;
  - `the pill reads +?, +0 and +n, muted for +? and +0`;
  - `one chip per target in card order`;
  - `five targets show two rows and +n` (the full list in the accessible name);
  - `the character name is not repeated beside the card`.
- [ ] **Step 2: Run them.** Expected: they fail.
- [ ] **Step 3: Implement `PlayerSide` and wire it in.**
  - Lines 1 and 2 use `fitText` (one line, 80 % floor).
  - The reveal and Potion steps keep opponent-left. The showdown orders by `plans_revealed.order`.
- [ ] **Step 4: Run `pnpm test`, `pnpm lint`, then `e2e` (without and with `@pseudo`), `e2e:online` and `e2e:pwa`, one at a time.** Expected: all pass, in every language. The German replay showdown's room is re-measured, since this layout replaces the one it was tuned for.
- [ ] **Step 5: Update the docs and the deploy notes.**
  - Spec §8.1: describe the shared reveal and showdown sides, the pill, and the marker timing and animation.
  - CLAUDE.md: status (the playtest fixes are done; next, the paused rulebook and tutorial plan) and a Documents row for the design note and this plan.
  - The final report reminds the owner to deploy when no online game is in progress.
