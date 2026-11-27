# M5 Rulebook and Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Someone who has never played can learn Werewolf: Duel! in the app: six rules pages in our own words, and one coached round against a scripted opponent on the real table, in English, German and Japanese.

**Architecture:** The rules are Fluent messages rendered by one `RulesPage` component, used by a `#/rules/<section>` route and by a sheet over the game table. The tutorial is a real local game: a `MemoryReferee` with a seeded random source (so the deal is always the same), a second `GameClient` for the opponent driven by a data-only script, and a coach passed to the existing `Table` that takes over the phase bar's step label, instruction and button and limits which choices are enabled. Nothing changes in the engine or the protocol.

**Tech Stack:** Svelte 5, TypeScript, Fluent (`@fluent/bundle` via `client-core`), `@wwd/referee-memory`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-m5-rulebook-tutorial-design.md` (this plan argues from it; read it first). Background: spec `docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md` §5 (rules), §8.1, §8.4; `docs/superpowers/specs/2026-11-26-m5-languages-design.md` (grammar, checks).

## Global Constraints

- No git state changes by Claude; the owner commits (CLAUDE.md, memory).
- Engine and protocol unchanged. Every tutorial move goes through the engine; the UI only chooses which legal choices to offer.
- IP: rules in our own words; never the publisher's rulebook text, layout or art; the unofficial notice stays on every page it is on today.
- All player-facing text in Fluent `ui.ftl` (EN, DE, JA); character names through `CHARACTER()`, marker names as arguments so their tokens show; no sentences joined in code.
- British English, sentence case; comments per CLAUDE.md (one-line `//`, no file paths, no dependent comments).
- Game screens fit 360 × 640 and 390 × 844 with no scrolling at 100 % text; no sideways scrolling at 320 px; whole at 150 % with 24-character names (spec §8.1). The tutorial screens are game screens.
- Never information by colour alone; reduced motion respected (no pulse, no scripted delay).
- The opponent's name is defined once per language as `-tutorial-opponent` (EN Alicia, DE Lena, JA さくら); no text uses a pronoun for her; code never holds the name.
- Downloads need the owner's explicit yes: `fonts:ja` fetches the source fonts, so Task 4 asks before running it.
- Playwright suites run one at a time.

- Built on the playtest fixes (engine 0.3.0, protocol 4): hand cards hidden from the targets, the shared reveal/showdown sides, and marker counts on the shown step. See the design note's "Built on the playtest fixes". Ring test ids are the current ones (for example `reveal-sides`, not the old `reveal-versus`).
- No text uses a pronoun for the opponent, including "their" (see the design note's "The opponent's name").

## Review Focus

1. **Leaving at any moment** (menu, browser Back, reload), including while the opponent's delayed move is pending or mid-showdown: no command is sent after the run is disposed, no error is shown, and the player lands on How to play. → Task 3, `leaving at every step returns to How to play and sends nothing more`.
2. **The player's own settings**: Showdown speed "auto"/"instant", Confirm plan on, Rules hints on. The tutorial still stops on every step, shows no confirm dialog and no hint in place of the coach. → Task 3, `the tutorial ignores showdown speed, confirm plan and rules hints`.
3. **An unknown rules section** (`#/rules/nope`) or an old `#/how-to-play` link: the first lands on How to play, the second still opens How to play. → Task 1, router tests.
4. **Full rules over a live game**: opening the sheet while the opponent acts keeps the game updating behind it, Escape closes it and focus returns to the drawer. → Task 1, `the rules sheet keeps the table live and returns focus`.
5. **A returning player** (history or `firstGameFinished`) never sees Home's newcomer panel, and a backup made before this change restores with both new flags false. → Task 3, settings and Home tests.

---

### Task 1: The rulebook (English)

**Files:**
- Create: `app/apps/web/src/rules/sections.ts`, `app/apps/web/src/rules/RulesPage.svelte`, `app/apps/web/src/rules/CharactersSection.svelte` (the body of today's character reference, moved), `app/apps/web/src/screens/HowToPlay.svelte` (the hub), `app/apps/web/src/screens/Rules.svelte` (the route screen), `app/apps/web/src/table/RulesSheet.svelte`
- Modify: `app/apps/web/src/router.ts`, `app/apps/web/src/App.svelte`, `app/apps/web/src/screens/CharacterReference.svelte` (deleted once its body moves; its callers move to the hub or the section), `app/apps/web/src/table/LogDrawer.svelte` (a **Full rules** row), `app/packages/client-core/locales/en/ui.ftl`, `app/packages/client-core/locales/{de,ja}/ui.ftl` (English copies of the new messages for now; see Step 7), `app/apps/web/src/gallery/entries.ts` and `fixtures.ts`
- Test: `app/apps/web/test/rules/sections.test.ts`, `app/apps/web/test/router.test.ts`, `app/apps/web/test/rules/RulesPage.test.ts`, `app/apps/web/e2e/rules.spec.ts`, and the existing How to play tests moved to the new ids

**Interfaces:**
- Produces:
  - `type RulesSection = 'goal' | 'setup' | 'round' | 'markers' | 'characters' | 'fine-points'`
  - `RULES_SECTIONS: readonly RulesSection[]` (in that order)
  - `neighbours(section: RulesSection): { previous: RulesSection | null; next: RulesSection | null }`
  - `rulesHref(section: RulesSection): string`, which returns `#/rules/<section>`
  - Route `{ name: 'rules'; section: RulesSection }`
  - `RulesPage.svelte` props: `{ localiser: Localiser; section: RulesSection; onNavigate: (section: RulesSection) => void }`
  - `RulesSheet.svelte` props: `{ localiser: Localiser; open: boolean; onclose: () => void }`
  - `HowToPlay.svelte` takes a `tutorial` snippet slot for the panel Task 3 fills in. Until then the panel's button links to `#/tutorial`, which Task 3 creates.
- Fluent ids: `how-to-play-*` (hub), `rules-<section>-*` (one message per paragraph), `rules-sheet-*`, `drawer-full-rules`.

- [ ] **Step 1: Write the failing tests.**
  - `sections.test.ts`:
    - `RULES_SECTIONS` equals the six ids in order.
    - `neighbours('goal')` is `{ previous: null, next: 'setup' }`.
    - `neighbours('fine-points').next` is `null`.
  - `router.test.ts`:
    - `routeFor('#/rules/round')` is `{ name: 'rules', section: 'round' }`.
    - `routeFor('#/rules/nope')` is `{ name: 'how-to-play' }`.
    - `routeFor('#/how-to-play')` is unchanged.
  - `RulesPage.test.ts`:
    - Each section renders its heading.
    - It shows "Rules · n of 6".
    - Previous is absent on the first section and Next is absent on the last.
    - "Characters" renders every character and the Fool, with "How to read abilities".
- [ ] **Step 2: Run `pnpm --filter @wwd/web test`.** Expected: the new tests fail.
- [ ] **Step 3: Build the sections, route, hub, page and sheet.**
  - The hub has a "New to the game?" panel, then a "Rules" panel of six rows: number, title, one-line description, chevron, each linking to `rulesHref`. See design mockup A1.
  - Pages use the `Screen` component: the bar's ← goes back to How to play; the label reads "Rules · n of 6"; Previous and Next sit at the bottom.
  - Pictures come only from existing components (`CardFace`, pills, `MarkerIcon`, rich text).
- [ ] **Step 4: Write the English rules text** in `en/ui.ftl`.
  - It covers spec §5 for the default rules: the goal, setting up, a round (the five steps of mockup A3), markers and fine points.
  - Fine points are: ties, an empty Hourglass supply, a character that has already acted is immune, the Potion (any character not in your hand this round, including your own targets), the Wolf King's Fangs, the Hunter's optional Cross, why cards in your hand are never targets, the Fool, and the two host options (`badge_only` tie-break, zero targets).
  - Our own words, "you" / "your opponent", one message per paragraph.
- [ ] **Step 5: Add the in-game sheet.**
  - The log drawer's Rules part gains a **Full rules** row (`drawer-full-rules`).
  - The row opens `RulesSheet` over the table at "A round", with the same Previous/Next.
  - Escape closes it and focus returns to the row.
  - Test `the rules sheet keeps the table live and returns focus` (e2e:online): open the sheet while the other seat seals a plan, close it, and the opponent's "Sealed" chip is showing.
- [ ] **Step 6: Gallery and e2e.**
  - Gallery entries: `how-to-play` (now the hub), `rules-goal`, `rules-round`, `rules-fine-points`, `rules-characters` (the old reference), `table-rules-sheet`.
  - `rules.spec.ts` walks Next from "The goal" to "Fine points" and back to How to play.
  - Every layout, wide and axe check covers the new entries.
- [ ] **Step 7: Keep the completeness check green.**
  - The German and Japanese files get the new ids with the English text.
  - Every new id goes on `locales.test.ts`'s `UNTRANSLATED` allow-list, with the reason "Task 4 of the rulebook plan".
- [ ] **Step 8: Run `pnpm test`, `pnpm lint`, then `pnpm --filter @wwd/web e2e` and `e2e:online` one at a time.** Expected: all pass.

### Task 2: The tutorial game (no UI)

**Files:**
- Modify: `app/packages/referee-core/src/codes.ts` and `index.ts` (move `seededRandom(seedHex: string): Random` here from `referee-service`, which re-exports it unchanged)
- Create: `app/apps/web/src/tutorial/script.ts`, `app/apps/web/src/tutorial/runner.ts`, `app/apps/web/scripts/tutorial-seed.mjs` (searches seeds)
- Modify: `app/packages/client-core/locales/{en,de,ja}/ui.ftl` (`-tutorial-opponent`, `tutorial-opponent-name`)
- Test: `app/apps/web/test/tutorial/script.test.ts`, `app/apps/web/test/tutorial/runner.test.ts`

**Interfaces:**
- Produces, in `script.ts`:
  - `TUTORIAL_SEED: string`, the hex seed found by the search
  - `type TutorialStepId = 'goal' | 'plan' | 'reveal' | 'showdown' | 'round-end'`
  - ```ts
    interface TutorialStep {
      id: TutorialStepId;
      /** data-testid values the coach rings */
      ring: readonly string[];
      /** 'next': explain only; 'game': the player's real action ends the step */
      advance: 'next' | 'game';
      /** what the player may choose at this step */
      allow: TutorialAllow;
      /** the opponent's move at this step, sent when the engine asks for it */
      opponent: Command | null;
    }
    ```
  - `interface TutorialAllow { character?: Character; targets?: readonly TargetCard[]; hourglasses?: number }`
  - `TUTORIAL_STEPS: readonly TutorialStep[]` (5)
- Produces, in `runner.ts`:
  - `startTutorial(opts: { playerName: string; opponentName: string; delayMs: number }): Promise<TutorialRun>`
  - ```ts
    interface TutorialRun {
      player: GameClient;
      step: Readable<number>;
      next(): void;
      dispose(): void;
    }
    ```
  - `step` is 0–4; `next()` moves on from a `'next'` step; a `'game'` step moves on when the player's matching action is applied.
  - After `dispose()`, nothing is sent.
- Fluent:
  - each language's `-tutorial-opponent`: EN `Alicia`, DE `Lena`, JA `さくら`;
  - `tutorial-opponent-name = { -tutorial-opponent }`.

- [ ] **Step 1: Move `seededRandom` to `referee-core`.** Keep its tests passing in `referee-service`.
- [ ] **Step 2: Write `tutorial-seed.mjs`.**
  - It builds a `MemoryReferee({ random: seededRandom(seed) })` the same way `startTutorial` does.
  - The room is created with `{ ...defaultRulesConfig(), badge_start: { seat: <player's seat> } }`.
  - The player joins first, then the opponent.
  - It tries seeds until the player holds the Badge with exactly **Knight, Seer, Witch, Villager** and the opponent holds the **Wolfen**.
  - It prints the first match.
  - Run it once, then paste the seed into `TUTORIAL_SEED`.
- [ ] **Step 3: Write the failing tests.** `script.test.ts` plays `TUTORIAL_STEPS` through a real `MemoryReferee` with `TUTORIAL_SEED` and asserts:
  - the player's hand is Knight, Seer, Witch, Villager, and they hold the Badge and 0 Hourglasses;
  - the opponent holds the Wolfen and 1 Hourglass;
  - every scripted move is in the engine's legal actions when it is sent;
  - the player plans **Knight → Wolfen** and the opponent **Wolfen → Seer**; both place 0;
  - after the showdown, the Wolfen is eliminated, the opponent has 1 Health, the player has 1 Hourglass, and the Badge has passed to the opponent;
  - the game is not over.

  The test fails, naming `TUTORIAL_SEED`, if the engine ever deals differently.

  `runner.test.ts`:
  - `step` goes 0→4 as the script is followed;
  - `next()` is ignored on a `'game'` step;
  - after `dispose()` during a pending opponent move (fake timers), no command reaches the referee.
- [ ] **Step 4: Implement `script.ts` and `runner.ts`.**
  - The runner creates the referee and room, and two in-memory pairs.
  - The player's `GameClient` uses `playerName`; the opponent's uses `opponentName`.
  - The opponent's moves are sent `delayMs` after the engine asks for them.
- [ ] **Step 5: Run `pnpm test`.** Expected: all pass.

### Task 3: The coached tutorial and Home's panel (English)

**Files:**
- Create: `app/apps/web/src/tutorial/coach.ts`, `app/apps/web/src/screens/Tutorial.svelte`, `app/apps/web/src/tutorial/TutorialDone.svelte`, `app/apps/web/src/components/NewcomerCard.svelte`
- Modify:
  - `router.ts`: `{ name: 'tutorial' }` at `#/tutorial`
  - `App.svelte`
  - `screens/Table.svelte`, `table/PhaseBar.svelte`, and the hand, target and Hourglass pickers, which honour `coach.allow`
  - `screens/HowToPlay.svelte`: the tutorial panel, which reads "Tutorial finished" with "Play it again" once finished
  - `screens/Home.svelte`
  - `settings/settings.ts` and `normaliseSettings`
  - `en/ui.ftl`, and the `de`/`ja` copies and `UNTRANSLATED` entries as in Task 1
  - gallery entries and fixtures
- Test: `app/apps/web/test/tutorial/coach.test.ts`, `test/screens/Home.test.ts`, `test/settings/settings.test.ts`, `e2e/tutorial.spec.ts`

**Interfaces:**
- Consumes: Task 2's `startTutorial`, `TUTORIAL_STEPS`, `TutorialAllow`; Task 1's `HowToPlay` tutorial slot and `rulesHref`.
- Produces, in `coach.ts`:
  - ```ts
    interface Coach {
      step: number;
      count: number;
      title: string;
      text: RichParts;
      ring: readonly string[];
      allow: TutorialAllow;
      button: { label: string; run: () => void } | null;
    }
    ```
    `button` is null when the real action button is used.
  - `coachFor(l: Localiser, step: TutorialStep, next: () => void): Coach`
- Produces: `Table` prop `coach?: Coach | null`. When it is set:
  - the bar title is "Tutorial";
  - the phase bar shows "Tutorial · n of 5 · title", five progress steps, the coach text, and the coach's button or the real one;
  - elements whose `data-testid` is in `ring` get the class `coach-ring`: a 3 px dashed outline in `--focus`, offset 3 px;
  - choices outside `allow` are disabled, with the coach text as their description;
  - showdown speed is "step", Confirm plan is off and Rules hints are off for this table only.
- Produces: settings `tutorialFinished: boolean` and `newcomerCardDismissed: boolean`, both false by default and in backups.
- Fluent ids: `tutorial-*` (step titles, coach text, finished page), `home-newcomer-*`. Every mention of the opponent is `{ -tutorial-opponent }`.

- [ ] **Step 1: Write the failing tests.**
  - `coach.test.ts`: `coachFor` gives each step's title and text.
  - `settings.test.ts`: `normaliseSettings({})` has `tutorialFinished: false` and `newcomerCardDismissed: false`, and a stored backup without them restores both as false.
  - `Home.test.ts`: the newcomer panel shows only when there is no history, `firstGameFinished` is false, and neither new flag is set. Dismissing it sets `newcomerCardDismissed`.
- [ ] **Step 2: Run them.** Expected: they fail.
- [ ] **Step 3: Implement the coach in `Table` and `PhaseBar`.**
  - The coach text is a polite live region.
  - On a step change, focus moves to it.
  - Rings never animate.
  - With reduced motion, `delayMs` is 0; otherwise it is 600.
- [ ] **Step 4: Implement `Tutorial.svelte`.**
  - It calls `startTutorial` with the player's stored display name (no prompt; an empty name is fine, as the table calls the player "You") and `l.t('tutorial-opponent-name')`.
  - The finished page's buttons go to New game, `rulesHref('goal')` and a fresh `#/tutorial`.
  - It renders `Table` with the coach.
  - It passes a `menu` snippet with **Leave tutorial**, and no `onResign` or `onPause`.
  - After step 5, Finish shows `TutorialDone` (mockup B5) and sets `tutorialFinished`.
  - Leaving (the menu, Back, `pagehide`) disposes the run and goes to `#/how-to-play`; a reload lands there too.
- [ ] **Step 5: Write the English coach text** for the five steps, as in the design's script table. Step 2 presents the Wolfen as a guess, never as something the player can know.
- [ ] **Step 6: Add Home's `NewcomerCard`** below How to play / History (mockup A4), with Learn to play and a dismiss (✕) button.
- [ ] **Step 7: Gallery and e2e.**
  - Gallery entries: `tutorial-goal`, `tutorial-plan`, `tutorial-reveal`, `tutorial-showdown`, `tutorial-round-end`, `tutorial-done`, `home-newcomer`.
  - `tutorial.spec.ts` (English) has four tests:
    - `plays the tutorial from How to play to the end`: checks each step's text, that only the taught choice is enabled, and the outcome (opponent at 1 Health, Wolfen eliminated).
    - `leaving at every step returns to How to play and sends nothing more`: afterwards Home's Continue, History and Stats show nothing from the tutorial.
    - `the coach fits in three lines`: at 360 px and 100 % text, each step's coach text is at most three lines (over the tutorial gallery entries; in every language once Task 4 lands).
    - `the tutorial ignores showdown speed, confirm plan and rules hints`: set all three, then play through.
  - Every layout, wide and axe check covers the new entries.
- [ ] **Step 8: Run `pnpm test`, `pnpm lint`, `pnpm --filter @wwd/web e2e`, then `e2e:online`.** Expected: all pass.
- [ ] **Step 9: Owner checkpoint.** Show the owner the English rules and tutorial text as a Markdown file in the plan's workspace, and screenshots of the tutorial steps. Apply their wording changes before Task 4.

### Task 4: German, Japanese, every check and the docs

**Files:**
- Modify: `app/packages/client-core/locales/{de,ja}/ui.ftl`, `client-core/test/locales.test.ts` (empty the Task 1 and 3 `UNTRANSLATED` entries; add the opponent-name check), `app/apps/web/src/theme/ja-fonts/*` (regenerated), `layout.spec.ts` / `wide.spec.ts` / `a11y.spec.ts` language lists if any new entry needs adding, spec §8.1 item 10 and §8.4, the design note's status, `CLAUDE.md` (status and the Documents table), `README.md`

- [ ] **Step 1: Write the failing test** `no tutorial text writes the opponent's name out` in `locales.test.ts`. For each language, every `tutorial-*` and `how-to-play-*` message's source text must not contain that language's `-tutorial-opponent` value. Confirm it fails when one message writes "Alicia".
- [ ] **Step 2: Translate** every new message into German (du-form, "dein Gegenüber", names via `CHARACTER()` with the right case) and Japanese, at the finish the languages project set. Remove the `UNTRANSLATED` entries.
- [ ] **Step 3: Ask the owner** before running `pnpm --filter @wwd/web fonts:ja`, which downloads the source fonts. On a yes, regenerate the subsets. Without one, stop and report.
- [ ] **Step 4: Run the full set,** one Playwright suite at a time: `pnpm test`, `lint`, `e2e --grep-invert @pseudo`, `e2e --grep @pseudo`, `e2e:online`, `e2e:pwa`. Also run `tutorial.spec.ts` in `de` and `ja`, using the gallery's `?lang=` and the Language setting.
- [ ] **Step 5: Update the docs.**
  - Spec §8.1 item 10 describes what was built.
  - §8.4's "the rulebook as localised Markdown" says the rulebook is Fluent messages, citing the design note.
  - The design note's status line.
  - CLAUDE.md: status (rulebook and tutorial complete; next, the deferred-settings design) and a Documents row for the design note and this plan.
  - README: a line on How to play.
