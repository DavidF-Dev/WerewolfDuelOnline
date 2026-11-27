# Playtest fixes — design

**Date:** 2026-11-27
**Status:** approved by the owner 2026-11-27
**Context:** fixes from the owner's playtest on 2026-11-26. They come before the M5 rulebook and tutorial plan (`docs/superpowers/plans/2026-11-26-m5-rulebook-tutorial.md`), which is on hold until these ship.
**Mockups:** drawn on the real screens at 360 × 640 in the design conversation (targets, hand lift, the Hourglass pill, the reveal and showdown headers, marker animation). They are throwaway; this note is the reference.

## Intent

Playing on a phone showed several rough edges:

- you could target your own cards;
- the target grid was hard to read;
- a card stayed on top of the hand after it was deselected;
- the opponent's markers wrapped;
- the reveal and showdown panels were cramped;
- marker counts changed before the step that explains them.

These changes make a round easier to read and harder to get wrong.

## Goals

1. **In-hand targets are illegal** (engine rule) for plans and the Potion, and the plan screen hides them. The Potion may name the holder's own plan targets.
2. **The Villager and the Witch choose the Fool for you.**
3. **Unusable targets are faded and smaller**, not crossed out, and only once a character is chosen.
4. **The hand returns a deselected card to its place**, and raises the chosen card half as far.
5. **The opponent's strip stays on one row:** the Potion reads as a count, and placed Hourglasses move to a pill by their card.
6. **The reveal and showdown panels share one tidy layout,** ordered by who acts first.
7. **Marker counts change on the step that reads the change out,** with a short animation.

## Non-goals

- Any other rules change, beyond the two above.
- Changes to the CLI's text beyond the new error message.
- Keeping recorded games that used an in-hand target playable (see "Old games").

## Anti-goals

- Information by colour alone; motion that ignores Reduced motion.
- The UI deciding legality: what may be targeted still comes from `legal_actions()`.
- A game screen that no longer fits 360 × 640 at 100 % text.

## Constraints

- The engine rules: determinism, no display strings, ids only, every rule mapped to a named test (CLAUDE.md).
- Spec §5.3 currently says "Targets may name a card in the player's own hand. This is legal but pointless; the UI warns." This design replaces that line.
- `ENGINE_VERSION` is bumped whenever the same commands produce a different state (spec §6.2). Replays from a listed earlier version are re-simulated under the current engine, with every command checked.
- All three languages (EN, DE, JA) get every new string, and every layout, wide and axe check passes in each.

## Approaches considered (old games)

The new rule makes some commands that used to be legal illegal, so a recorded game that used one of them no longer verifies.

| | What it is | Trade-off |
|---|---|---|
| A rules setting | New games forbid in-hand targets; games recorded before the change keep allowing them | Nothing breaks; adds a setting and a protocol bump for a case only two players have hit |
| **Accept the break** *(owner's choice, 2026-11-26)* | The rule applies to every game | A saved or recorded game that used an in-hand target can no longer be opened; there are two active players |

*(My call)* `0.2.0` is added to the engine's list of compatible earlier versions, so a 0.2.0 replay is re-simulated under the new rules. Only games that actually used an in-hand target fail. Every other replay and save keeps working.

## Design

### 1. In-hand targets (engine)

- **Plan:** a target card may not name a character in the planning player's hand this round. The Fool is not a character, so it is unaffected. `legal_actions()` leaves these targets out, and `apply()` rejects them with the new error id `error-target-in-hand`.
- **Potion:** the Potion may not name a character that was in its holder's hand this round, whether played or discarded. Those can never be the opponent's character.
  - *(Owner 2026-11-27)* The Potion **may** name a card the holder's plan already targets, so naming one of your own targets is now allowed. Of today's exclusions, only the Fool stays. Spec §5.3 C changes from "one of their unplayed target cards" to "any character not in their hand this round".
  - So the Potion always has at least four legal targets (eight characters, minus at most four in hand), and the Potion step can never be left with no choice. The fuzz runs check this.
  - The error id is `error-potion-target-in-hand`.
  - The engine clears `hand` once both plans are in, so it gains a new piece of state: **the hand as dealt this round**, per player. It is set at the deal and by the unsafe `SetHands` edit, and kept separate from `hand`, which feeds the hand size shown to both players. It is part of the state hash; the version bump covers that.
- **Tests:** each rule gets a named test (legal actions exclude the card; apply rejects it; the Fool is still allowed), plus the CLI's fuzz runs.
- **Version:** `ENGINE_VERSION` becomes **0.3.0**. `0.2.0` joins `0.1.0` in the compatible list (see above).
- *(My call)* **`PROTOCOL_VERSION` becomes 4.** An installed app still on the old engine then gets the update prompt instead of meeting error ids it has no text for, and saving replays it can't open.
- **Deploying:** a live online room whose current round already used an in-hand target can't be restored after the deploy. Deploy when no game is in progress (two players; noted in the plan's last task).
- **Spec:** §5.3's "legal but pointless" line is replaced by the rule. The new error messages are added in all three languages, including the CLI's.
- **Old games:**
  - **Replays:** a replay that no longer verifies opens to a new message, `replay-unplayable`: "This game was played under older rules and can't be replayed." It must not fall back to today's `replay-missing` ("This game is not on this device"), which would be wrong.
  - **History and Stats:** its History row and win totals stay, since they come from stored fields. *(My call)* Its character picks and success rates drop out of Stats, because those are worked out by replaying the game. This follows from accepting the break.
  - **Saves:** a save that no longer verifies is refused on Resume with the existing `save-failed-invalid` message.

### 2. The plan screen's targets

- **Cards in your hand are not shown** as targets. The grid shows the rest (five or six cards, depending on your hand size) three to a row, drawn **5 % larger** than today's target cards. The "In hand" pill on target cards goes away; spec §8.1's deduction-tracker note is updated to say so.
- **Before a character is chosen**, every shown target is drawn normally.
- **Once a character is chosen**, targets it can't use are drawn at **60 % opacity and 90 % size**, with no cross. They stay in place, so the grid doesn't move. They stay `aria-disabled` with their reason, as today.
- **The Villager and the Witch** choose the Fool for you when chosen, if the game requires at least one target (`min_targets: 1`). The Fool is marked as chosen by the app.
  - Switching to another character clears that Fool, but not a Fool the player chose themselves.
  - With `min_targets: 0`, nothing is chosen for you.
- **The Potion picker** applies the same rule: it shows only the targets the engine allows, without this round's hand cards.

### 3. The hand

- A card is raised only while it is the **chosen character**, the card being **previewed** (long press), or **keyboard-focused** (`:focus-visible`). A tap's leftover focus no longer keeps a card on top, so a deselected card returns to its place in the fan.
- The chosen card rises **7 px** instead of 14 px (half as far).

### 4. Markers in the strips

- **The Potion** shows like the other markers: its token and the count "1", in both the opponent's strip and your own row. Its accessible name is unchanged.
- **"Hourglasses placed: n"** leaves the opponent's strip, which stays one row.

### 5. The reveal and showdown panels

One component draws both. Each player gets a side with:

- a small card: the target-size card, or the face-down back while it is hidden;
- line 1: **"You"** or **"Opponent"**, never wrapping (a fitted one-line label, like the others);
- line 2: **"Initiative n"**, or **"Initiative 4 → 3"** once Hourglasses change it; also never wrapping. While the opponent's card is face down it reads **"Initiative ?"**, muted.
- below, **one chip per target**, "→ Hunter", in the card's order. Chips may wrap to two rows; a third row becomes "+n", with the full list in the side's accessible name.

The character's name is not repeated; it is on the card.

**During the reveal:**
- The opponent's side shows the **placed-Hourglass pill** instead of chips: an Hourglass token and "+?" while they are still choosing (muted), then "+0" (muted) or "+n" (full strength).
- The pill replaces today's "Placed n Hourglasses" caption.
- The sides keep today's order: opponent left, you right.

**The Potion step** comes before the plans are revealed, so it keeps the reveal's layout: the opponent's card stays face down with "Initiative ?" and the pill, and the opponent stays on the left.

**Once the plans are revealed** (the showdown):
- The opponent's side fills in.
- The two sides are ordered **left to right by who acts first** (`plans_revealed.order`, which includes ties).

The panel must still fit 360 × 640 at 100 % text in the worst case: a Wolf King with four or more targets, with the Potion picker below it.

### 6. Marker counts and their animation

- **Timing:** during the showdown, both marker rows show the state **as of the last step shown**, worked out from the events of the steps not yet shown, so each count changes on the step that reads it out. With Showdown speed "instant" (or once every step is shown), they show the live state as today. Outside the showdown they follow the live state: placing Hourglasses, the Potion spent, and so on.
- **Animation**, whenever a shown count changes:
  - **Gain:** a green glow behind the marker and count, and the count slides up with a small pop and a "+1" (or "+n") label.
  - **Loss:** a red glow, the count slides down, and "−1".
  - The label carries the meaning as well as the colour.
  - The count moves for about 0.45 s with an ease-out, and the glow fades over about 1.2 s.
- **Reduced motion:** no sliding or pop; a still highlight ring and the ±n label show for about 1.2 s.
- **Screen readers:** nothing extra. The step's text is already announced.
- **Performance:** CSS animations only; no per-frame JavaScript and no allocation per frame.
- *(Builder's notes)*
  - The table works the shown state out from the live view by taking back the effects (gains, payments, Health lost, the Witch's Potion) of the steps not yet shown; the list reports how many it shows. A list just drawn shows its first step, so a page loaded mid-showdown draws that step's counts at once, without animating.
  - Each change is held for 1.2 s by one timer, which also ends the still highlight under Reduced motion; the count's ease-out is `cubic-bezier(0.22, 1, 0.36, 1)`, and the glow is 26 % of `--ok` or `--heart` with a soft shadow.
  - A Potion that appears after the row is first drawn counts as a gain of 1. One that is spent shows its loss ("−1", or the still ring under Reduced motion) for the same 1.2 s before it leaves the row, hidden from screen readers meanwhile.
  - The Replay's counts are each step's own view, so they follow the step both ways and animate as it changes.

## Testing

- **Engine:** named tests for both rules, including that the Potion may name the holder's own plan target and always has a legal target; legal actions; the version list (a 0.2.0 replay without in-hand targets verifies, one with them fails as `ReplayError`).
- **Web unit:**
  - the target grid hides hand cards;
  - faded rather than crossed out;
  - the Fool is chosen for the Villager and the Witch, cleared again, and never chosen for you with `min_targets: 0`;
  - the shown-marker state at each showdown step;
  - the pill states.
- **e2e:**
  - a deselected hand card is no longer on top (its stacking order is back to its neighbours');
  - the Potion picker offers no hand card;
  - marker counts change on the step that reads them out;
  - reduced motion shows no movement.
- **Gallery:** new or updated entries for the plan before and after a character is chosen, the Villager with the Fool chosen for you, each pill state, the reveal with two and with four targets, the showdown in acting order, and a marker mid-animation. Every layout, wide and axe check covers them, in every language.

## Left to the builder

- How the shown-marker state is computed and where it lives (one shared helper for both rows).
- The exact easing curve and glow colours, from the theme's tokens, in light, dark and high contrast.
- How the chosen-for-you Fool is remembered (it is UI state only).
