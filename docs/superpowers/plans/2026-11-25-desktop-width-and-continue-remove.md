# Desktop Width and Continue Remove Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On wide screens the bar, sky and treeline span the window while content stays in the centred phone column; and a game can be removed from Home's Continue list after confirmation.

**Architecture:** `Screen` stops limiting its own width; each full-width band (bar, banners, body, phase bar, note, page footer) constrains its content to a centred 30 rem column through one shared CSS custom property. A new wide placeholder treeline replaces the 360-px one. Home's Continue rows gain a "More" menu whose only item removes the device's session record via the existing `store.sessions.delete(id)`, behind a kit `Dialog`.

**Tech stack:** Svelte 5, Vite, Playwright, Vitest; the existing kit (`Dialog`, `IconButton`, `Panel`, `ListRow`, `Button`).

**Spec:** `docs/superpowers/specs/2026-11-25-desktop-width-and-continue-remove-design.md` (approved), within `docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md` §8.

## Global Constraints

- No git state changes (the owner commits). Implementers never spawn subagents. Run Playwright suites one after another, never concurrently.
- Verification (from `app/`): `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`, `pnpm --filter @wwd/web e2e`, `e2e:online`, `e2e:pwa`, `visual`. Engine untouched.
- Column width is `30rem`; the column's inner gutter stays `12px` (10 px where a screen is `tight`). Phone sizes (≤ 30 rem wide) must render exactly as today: the existing gallery same-image and layout tests stay green without changing their expectations.
- Game screens still fit 360 × 640 and 390 × 844 with no scrolling at 100 % text.
- Every string in Fluent (`ui.ftl`), British English, sentence case. Never colour alone; respect reduced motion; one h1 per screen; dialogs keep focus capture and restore.
- Placeholder art is our own simple shapes; no publisher art.
- Comments: none by default; one-line `//` only for a non-obvious why; no file paths.
- Tests must hold on Linux CI: assert geometry with sub-pixel tolerance (≤ 1 px), never exact pixel values that depend on font rendering.

## Review Focus

1. **Ultra-wide and odd widths** (2560 px, 481 px, 30 rem + 1 px): no gap at either edge, content exactly centred, no horizontal scroll. Test: `wide screens paint backgrounds edge to edge and keep content in the column` at 481, 1280, 1920 and 2560 px (Task 1).
2. **Sticky bar and phase bar at desktop width:** while the page scrolls (Settings, History) the full-width bar stays on top and nothing scrolls under its edges. Test: in the same spec, scroll Settings and assert the bar's left and right edges are the window's (Task 1).
3. **Removing the session you're about to resume elsewhere** (two tabs open on Home): the other tab must not crash or resume a deleted record; Resume on a removed row shows the existing "game not found" path. Test: `a removed session is gone for another Home tab after reload` (Task 2).
4. **Removing the last row:** the Continue panel disappears and focus lands on New game, not on `body`. Test: `removing the only game moves focus to New game` (Task 2).
5. **Keyboard and screen reader:** the More button is named per game, the menu closes on Escape and returns focus to its button, the dialog's default focus is Cancel. Test: `the more menu and remove dialog work from the keyboard` (Task 2).

---

### Task 1: Full-width backgrounds on wide screens

**Files:**
- Modify: `src/components/Screen.svelte` (drop the `max-width` on `.screen`; constrain each band's content), `src/components/AppBar.svelte` (bar content in the column), `src/kit/Scenery.svelte` (natural-height, centred, no stretch), `src/themes/placeholder/` (add `scenery-wide.svg`; wire it where `scenery.svg` is registered), `src/theme/tokens.css` (add `--column: 30rem`), `scripts/visual.mjs` (add `{ width: 1920, height: 1080 }` to `SIZES`)
- Create: `e2e/wide.spec.ts`
- Update: spec §8.3 and the layout-pass plan's owner decision 1 (one line each: backgrounds span the window, content stays in the 30 rem column).

**Interfaces (Produces):** the CSS custom property `--column: 30rem` on `:root`, and the inline padding formula `max(var(--gutter, 12px), calc((100% - var(--column)) / 2 + var(--gutter, 12px)))` used by every band; dialogs and sheets keep `max-width: 30rem` unchanged.

- [ ] **Step 1: Write the failing tests** in `e2e/wide.spec.ts` (desktop project):
  - `wide screens paint backgrounds edge to edge and keep content in the column`: for every gallery entry at widths 481, 1280, 1920 and 2560 (height 900): the `[data-part="top"]` bar, `main`, and the phase bar (when present) have `getBoundingClientRect().left ≤ 0.5` and `right ≥ innerWidth − 0.5`; every direct child of `main` and the bar's title and buttons lie within `[(innerWidth − 480)/2 − 0.5, (innerWidth + 480)/2 + 0.5]` (480 = 30 rem at 16 px); `document.scrollingElement.scrollWidth ≤ innerWidth`.
  - `the sticky bar stays full width while the page scrolls`: Settings at 1280 × 720, scroll by 400 px; the bar's rect is still `left ≤ 0.5`, `right ≥ innerWidth − 0.5`, `top` = 0 ± 0.5.
  - `the treeline is drawn at its natural height and not stretched`: at 360 and 1920 px the `.scenery` element's computed `mask-size` resolves to a 120 px height and its `mask-repeat` is not `stretch`; at 1920 the wide drawing is used.
- [ ] **Step 2: Run them.** `pnpm --filter @wwd/web exec playwright test e2e/wide.spec.ts --project desktop`. Expected: FAIL (backgrounds end at the column).
- [ ] **Step 3: Implement** as in Files. The wide treeline (our own shapes): village in the centre, trees thinning to the sides, one moon; drawn at 120 px height, centred (`mask-position: center bottom; mask-size: auto 120px`), with the outer trees continuing as a plain band on very wide screens rather than repeating the village or moon. At ≤ 30 rem the visible part matches today's drawing closely enough that the existing gallery images stay identical; if it can't, keep the old drawing below 30 rem and switch with a media query.
- [ ] **Step 4: Run** the new spec, then `e2e/gallery.spec.ts` (3×), `e2e/layout.spec.ts`, full `e2e`, `e2e:online`, `e2e:pwa`, `pnpm -r lint`, `visual`; look at the 1280 and 1920 images for home, settings-top, table-plan, game-over and a dialog in light and dark. Expected: PASS; phone-size images unchanged.
- [ ] **Step 5: Commit.** `feat(web): backgrounds span wide screens; content stays in the column`.

---

### Task 2: Remove a game from Continue

**Files:**
- Modify: `src/screens/Home.svelte` (More button and menu per row; dialog; removal; focus; status), `../../packages/client-core/locales/en/ui.ftl`
- Create: `src/components/RemoveGameDialog.svelte` (kit `Dialog`, destructive)
- Test: `test/screens/Home.test.ts` (or the existing Home test file), `e2e/home.spec.ts` if a browser check is needed for focus and axe

**Interfaces:**
- Consumes: `DeviceStore.sessions.delete(id: string): Promise<void>` and `sessions.list()`; kit `Dialog`, `IconButton`.
- Produces: `RemoveGameDialog` props `{ localiser: Localiser; opponent: string | null; finished: boolean; onremove: () => void; oncancel: () => void }`.

**Strings (exact, `ui.ftl`):**
- `home-more-label = More for the game with { $opponent }` (and `home-more-label-unknown = More for the game with an unknown opponent`)
- `home-remove = Remove from this device`
- `home-remove-title = Remove this game?`
- `home-remove-body = You won't be able to resume it from this device. If the game is still in progress, your seat may time out and your opponent may win. To rejoin later you'd need the join code and your PIN.`
- `home-remove-body-finished = It stays in your history.`
- `home-remove-confirm = Remove`
- `home-remove-cancel = Cancel`
- `home-removed = Game removed`
- `home-remove-failed = The game couldn't be removed. Try again.`

- [ ] **Step 1: Write failing tests:**
  - `each continue row has a named more button`: two sessions → two buttons named per `home-more-label`.
  - `remove asks first and cancel keeps the game`: open More → Remove → dialog titled `home-remove-title`, focus on Cancel; Cancel → `sessions.delete` not called; row still there; focus back on that row's More button.
  - `remove deletes only that session`: confirm → `sessions.delete` called once with that row's id; other rows, history and settings untouched; status `home-removed` announced politely.
  - `a finished game's dialog says it stays in history`: body is `home-remove-body-finished`.
  - `removing the only game moves focus to New game` (Review Focus 4); with more rows, focus goes to the next row's More button (or the previous when it was last).
  - `the more menu and remove dialog work from the keyboard` (Review Focus 5): Enter opens the menu, Escape closes it and returns focus, axe passes on the open menu and dialog.
  - `a removed session is gone for another Home tab after reload` (Review Focus 3).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The menu is a small popover anchored to the More button (one `menuitem`), closing on Escape, outside click and selection; on phones it may be the same popover. Removal calls `store.sessions.delete(id)`, then re-lists. Nothing is sent to the referee and no game is resigned.
- [ ] **Step 4: Run** the Home tests, full `e2e`, `e2e:online` (axe), `pnpm -r lint`, `visual` (Home with the menu and the dialog open: add gallery entries `home-more` and `home-remove`). Expected: PASS.
- [ ] **Step 5: Commit.** `feat(web): remove a game from Continue after confirming`.

---

### Task 3: Hover states and cursors

**Spec:** part 3 of the design note (approved; option A).

**Files:** `src/theme/base.css`, `src/theme/tokens.css` (hover tokens), `src/kit/{Segmented,Switch,Select,IconButton,ListRow,MenuButton}.svelte`, `src/components/CardButton.svelte`, `src/screens/Settings.svelte` (the display-name field's box); Test: `e2e/hover.spec.ts` (create).

- [ ] **Step 1: Write failing tests** in `e2e/hover.spec.ts` (desktop project, fine pointer): `clickable controls show the pointer cursor` (button, icon button, segmented option over its radio, switch, select, card button, More button), `text fields keep the text cursor`, `disabled controls show not-allowed`, `hover tints each control kind and leaving restores it` (computed background/border or the switch track's box-shadow differ while hovered, equal after moving away), `selected options and disabled buttons don't change on hover`, `with a coarse pointer hover changes nothing` (emulate `hasTouch`/coarse pointer).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with shared hover tokens (`--hover-bg`, `--hover-line`) in `tokens.css`, applied in base styles and each kit control under `@media (hover: hover) and (pointer: fine)`; transitions use the existing `--motion-fast` and respect reduced motion.
- [ ] **Step 4: Run** the new spec, gallery spec ×3 (hover must not affect captures: the pointer rests off-element), layout, full `e2e`, `e2e:online` (axe), `e2e:pwa`, `pnpm -r lint`, `visual`. Expected: PASS; phone images unchanged.
- [ ] **Step 5: Commit.** `feat(web): hover states and pointer cursors on every control`.
