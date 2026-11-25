# Desktop width and removing a game from Continue: design note

**Date:** 2026-11-25
**Status:** implemented 2026-11-25 (approved by the owner the same day)
**Builds on:** the layout pass (`docs/superpowers/plans/2026-11-23-layout-pass.md`); owner decision 1 there (a centred 30 rem column with `--bg` either side) is revised by part 1.

## 1. Full-width backgrounds on wide screens

**Why:** on a desktop browser the app looks like a phone floating in an empty dark page. The owner wants the backgrounds to use the width while the app keeps its phone-shaped layout.

**Approaches shown** (real app at 1280 × 720 with CSS injected; Home, the plan screen and Settings, light and dark):
- **A, chosen by the owner:** the bar's colour, the sky gradient and the treeline span the window; everything else (the bar's title and buttons, panels, cards, the phase bar's contents, the page footer) stays in the 30 rem column, centred. Calm, and the eye stays in one place.
- B: as A, but the bar's title and buttons spread to the window's edges. Rejected: on wide monitors the controls drift far from what they control.
- C: as A, plus a faint frame around the column. Rejected: brings back the boxed look.

**Design:**
- `Screen` no longer limits its own width. Its bar, banners, body, phase bar, note and page footer paint full width; each one's content is limited to the 30 rem column, centred, with the same 12 px inner gutter as today. At widths up to 30 rem nothing changes.
- Dialogs and sheets keep their 30 rem maximum and stay centred.
- **Treeline:** a new wide placeholder scenery drawing (our own simple shapes): the village in the middle and trees thinning out to the sides, with one moon. Drawn at its natural 120 px height, centred, never stretched; on very wide screens it continues with a plain tree band rather than repeating the village and moon. Up to 30 rem the old drawing is kept; the wide drawing and plain band are used only above 30 rem. Forced colours behave as today.
- Fit screens (360 × 640 and 390 × 844 with no scrolling) are unaffected, since the column's content does not change.

**Tests:** at 481, 1280, 1920 and 2560 px wide, 900 tall (plus the sticky-bar test at 1280 × 720), for every gallery entry: the bar, body and phase-bar backgrounds reach both window edges; all content lies within the centred 30 rem column; no horizontal scroll. Existing phone-size tests unchanged. The visual script gains a 1920 × 1080 size.

## 2. Removing a game from Continue

**Why:** stale or abandoned games stay in Home's Continue list ("Unknown opponent · In progress · 23 Nov") with no way to clear them.

**Design (my proposal; the owner approved the direction by approving this note):**
- Each Continue row gets a small "More" button (⋯, accessible name "More for the game with Jun") beside Resume/Open, opening a menu with one item: "Remove from this device". A menu, not a ✕, so it can't be hit by accident next to Resume, and has room for later actions.
- Choosing it opens a confirmation dialog (the kit `Dialog`, destructive style with the warning icon):
  - Title: "Remove this game?"
  - Body: "You won't be able to resume it from this device. If the game is still in progress, your seat may time out and your opponent may win. To rejoin later you'd need the join code and your PIN." For a finished game the body is just: "It stays in your history."
  - Buttons: "Remove" (danger), then "Cancel" (focused by default).
- Removing deletes only this device's session record for that game (seat token, pause save, `resumedAs` mark). Nothing is sent to the referee; the game is not resigned (resigning stays in the game menu). History is untouched.
- After removal, focus moves to the next row's More button (the previous row's when the removed row was last), or to New game if the panel disappears, and a polite status says "Game removed". If the record cannot be deleted, the row stays and the status says "The game couldn't be removed. Try again."
- **Removed stays removed on this device** (decided while building): removal goes through the session layer, so the tab forgets the seat at once, and the store keeps a removal mark of the seat token for 30 days. No tab stores that seat again: a tab still playing it stops saving it (a save that raced the removal is undone by its next save), and a tab that still lists it checks the mark before joining, so Resume, Back or an invite link joins as a newcomer instead (the room is then full, so the existing room-full offer to rejoin with the PIN appears). A new seat in the same room (a PIN rejoin gives a new token) is stored as usual and drops the mark, and importing a backup that holds the session brings it back.

**Tests:** the More button and menu are keyboard-operable and named; Cancel keeps the session; Remove deletes exactly that session record and nothing else (other sessions, history, settings untouched); focus moves as described; the dialog wording differs for finished games; axe on the dialog and menu.

## Left to the builder
- The exact wide treeline shapes, within "village centre, trees thinning out, one moon".
- Whether the More menu reuses the kit `Sheet` on narrow screens or a small popover everywhere (a popover, if it stays simple and accessible).

## 3. Hover states and cursors (approved 2026-11-25)

**Why:** on desktop, Settings' controls gave no sign of being interactive: the button hover tint was nearly invisible in dark, switches had hover turned off, the Theme options' hidden radios hid the hand cursor, and the display-name field had no hover at all.

**Approaches shown** (real Settings, five controls in hover at once, light and dark): **A (chosen): tint**, a light accent wash with an accent border; B: ring, an accent border plus a soft ring. B was rejected because it looks like the keyboard focus ring.

**Design:**
- **Cursor:** `pointer` on everything clickable (buttons, icon buttons, segmented options including their hidden radios, switches, selects, card buttons, the More button and menu items); text fields keep the I-beam; disabled controls keep `not-allowed`. Display-only cards (those no click acts on) keep the default cursor and get no hover ring.
- **Hover look (A):** unselected, enabled controls take `background: color-mix(in srgb, var(--accent) 12%, var(--surface))` and a border of `color-mix(in srgb, var(--accent) 55%, var(--control-line))`; text fields and selects tint their drawn border box the same way; switches show a 3 px accent halo around the track; primary and danger-solid buttons keep their existing darken; already-selected segmented options don't change. Exceptions: danger outline buttons keep their red border, with the tinted background and slightly darker danger text for 4.5:1; icon buttons keep their `currentColor` wash; cards show a 2 px `--hover-line` ring; middle segmented options tint only their background; a stepper button at its limit shows `not-allowed`; New game's "Advanced" disclosure summary hovers with accent colour and an underline instead of the tint.
- Only under `@media (hover: hover) and (pointer: fine)`; instant under reduced motion, otherwise a transition of at most 150 ms. Hover is an extra cue only. Forced colours keep the system styles.
- Built into the shared kit and base styles, so every screen gets it.

**Tests:** for each control kind on a gallery entry, under a fine pointer: the computed cursor is right (pointer, text or not-allowed); hovering changes the computed background or border (or the track's box-shadow for switches) and leaving restores it; a selected segmented option and a disabled button don't change; with a coarse pointer nothing changes on hover.
