# M5 rulebook and tutorial — design

**Date:** 2026-11-26
**Status:** approved by the owner 2026-11-26 (opponent renamed the same day)
**Milestone:** M5 "Reach" (spec §10), second of four projects: languages (done) → **rulebook and tutorial** → the deferred gameplay settings → the accessibility audit.
**Builds on:** spec §8.1 item 10 ("How to play: rewritten rulebook, character reference, 5-step interactive tutorial (scripted local game via the memory referee)"), §5 (the rules), §8.4 (localisation), and the M5 languages design (Fluent grammar, the three languages, the checks).
**Mockups:** drawn on the real screens at 360 × 640 during the design conversation (How to play, two rules pages, Home's first-run panel, tutorial steps 1–4 and the finished page). They are throwaway; this note is the reference.

## Intent

Someone who has **never played Werewolf: Duel!** can open the app, learn the game and start playing a friend without the physical rulebook. Today How to play is only the character reference, so a newcomer has no way in.

## Goals

- **A rulebook in our own words**: six short pages that teach the whole game in order and answer the edge cases.
- **A tutorial**: one guided round against a scripted opponent, Alicia, on the real game table, so the newcomer learns the screens they will actually play on.
- Both in English, German and Japanese, at the finish the languages project set: every check in every language.
- Both work offline (the installed app), like a local game.

## Non-goals

- A computer opponent or free play against the app. The tutorial is scripted.
- Teaching every character in the tutorial. Gains, the Potion and each character's ability are in the rulebook and the character reference.
- The "Tutorial tips" setting (tips during real games). It belongs to the deferred-settings project; this design only keeps the coach reusable for it.
- Changes to the rules, the engine or the protocol.

## Anti-goals

- Reproducing the publisher's rulebook text, layout or art (spec §2 and CLAUDE.md IP rules).
- A tutorial that re-implements rules or fakes game state. Every move goes through the engine (`legal_actions()`, `apply()`, `view()`), so the tutorial can never teach a rule the engine doesn't play.
- Colour alone marking what the coach points at.
- Building rules sentences in code from fragments.

## Constraints

- Everything a player reads lives in Fluent. The perspective rules, the `CHARACTER()` grammar function, bold names and marker tokens before marker names all apply (spec §8.4; languages design).
- Game screens fit 360 × 640 and 390 × 844 with no scrolling at 100 % text (spec §8.1). The tutorial is a game screen.
- Reduced motion is respected; the DOM stays semantic.
- Tests never touch Cloudflare; the tutorial needs no referee server at all.
- Wording: Claude writes the rules and tutorial text; the owner reviews the English before it is translated (spec §11). German and Japanese ship as Claude writes them, with no "beta" label (owner, languages project).

## Approaches considered (the tutorial)

| | What it is | Trade-off |
|---|---|---|
| **A. Coached round on the real table** *(chosen by the owner)* | A real local game run by the engine, with a fixed deal and Alicia's moves scripted; a coach in the phase bar explains each step and only the taught move is enabled | Teaches the real screens; can't drift from the rules; no experimenting |
| B. Illustrated walkthrough | Five pages of pictures and text with small taps; no game | Simplest; teaches neither the screens nor by doing |
| C. Free play with a coach | The newcomer plays freely against a computer opponent and the coach comments | Closest to real play; needs an AI opponent that doesn't exist, and the lesson isn't guaranteed |

*(My call, accepted with the mockups)* The rules text lives in the Fluent `ui.ftl` files, one message per paragraph, not in separate localised Markdown files as spec §8.4 suggested. Fluent gives it the German grammar, bold names, marker tokens, the completeness and pseudo-locale checks and lazy loading for free; Markdown would need its own renderer, token syntax and checks. Spec §8.4's "the rulebook as localised Markdown" is updated to say this.

## Design

### How to play (the way in)

How to play becomes a hub (mockup A1):

1. A **"New to the game?"** panel: one line ("Play one guided round against Alicia. It takes about five minutes, and you can leave at any time.") and a primary **Start the tutorial** button. Once the tutorial has been finished, the panel reads "Tutorial finished" with a secondary **Play it again** button.
2. A **Rules** panel listing six sections, each a row with its number, title, a one-line description and a chevron:
   1. **The goal** — three ways to win.
   2. **Setting up** — Health, Crosses, the Badge and the first Hourglass.
   3. **A round** — deal, plan, reveal, showdown, round end.
   4. **Markers** — Cross, Fang, Hourglass, Potion, Health and the Badge: what each does and where it comes from.
   5. **Characters** — today's character reference, including "How to read abilities". It keeps its current content and route; it gains the section's number in its label and the Previous/Next row.
   6. **Fine points** — ties, an empty Hourglass supply, a character that has already acted is immune, the Potion, the Wolf King's Fangs, the Hunter's optional Cross, targeting a card in your own hand, the Fool, and the two rules options a host can pick (the old-printing tie-break and zero targets).

*(My call)* The hub keeps How to play's route, `#/how-to-play`, so existing links still land on How to play; the character reference moves to `#/rules/characters`, and its gallery entry and tests move with it.

Each section is its own screen, `#/rules/<section>` (ids `goal`, `setup`, `round`, `markers`, `characters`, `fine-points`), with the bar's ← back to How to play, a small "Rules · n of 6" label, and **Previous / Next** buttons at the bottom (mockups A2, A3). The pages scroll like any other non-game screen. Pictures are the app's own: cards, pills and marker tokens through the existing components; no new art.

**Content** (Claude drafts, owner reviews): short paragraphs in our own words, covering all of spec §5 for the default rules. "A round" is the five numbered steps of mockup A3. The text speaks to the reader as "you" and "your opponent".

### The rules in a game

The game's log drawer keeps its short "Rules" part and adds a **Full rules** row. It opens the rules in a sheet over the table, starting at "A round", with the same six pages and Previous/Next, so an online game stays connected and on screen behind it. The rules pages are one component used by both the route and the sheet.

### Home (first run)

*(Mockup A4; owner 2026-11-26: brand-new players only.)* Home shows the panel only to a brand-new player: no game in History and the first-game-finished flag not set. It goes for good once the tutorial is finished, the panel is dismissed, or the player finishes a game. While it shows, Home shows a **"New to Werewolf: Duel!?"** panel under How to play / History: "Learn by playing one guided round." with a secondary **Learn to play** button and a dismiss (✕) button, like the install card. Both flags are stored with the settings (and so in backups).

### The tutorial

**Route and lifetime.** `#/tutorial`. It starts from How to play (or Home's panel) and always starts afresh. It is never saved, paused, resumed, listed in Continue, written to History or counted in Stats. Leaving is always one step away: the game menu (☰) offers **Leave tutorial** in place of Pause and Resign, and leaving returns to How to play. A reload returns to How to play.

**The game.** A real local game in the page, through the in-memory referee (`referee-memory`) with two seats: the player, and Alicia driven by a script. The room's random source is fixed, so the seed — and therefore the deal — is always the same. The Badge starts with the player (`badge_start: Chosen`). The player's display name is used as usual; the opponent's name comes from the text files (see "The opponent's name").

**The script.** One round, five steps, each with a title. Alicia's actions are submitted by the script when the engine asks for them, after a short pause (none with reduced motion). The deal is chosen by searching seeds (as `transcript --search` does) for:

- the player holding the Badge and **Knight, Seer, Witch, Villager**;
- Alicia holding the **Wolfen** among their three cards.

| Step | Title | The player | Alicia (scripted) | The coach says (gist) |
|---|---|---|---|---|
| 1 | Your goal | taps **Next** | — | Three ways to win: 4 Crosses, 3 Fangs, or your opponent's Health to 0. Points at both rows of markers. |
| 2 | Make a plan | chooses the **Knight**, targets the **Wolfen**, taps **Seal plan** | plans **Wolfen → Seer** | You can't see Alicia's cards: their character is one of the four you don't hold, and one of those is set aside, so every target is a guess. Three of those four are Werewolves, so a Werewolf is a good bet: try the Wolfen. The number on a card is its initiative: lower acts first, and the Knight (3) acts before the Wolfen (4). *(My call: the coach always presents the target as a guess, never as something the player can know.)* |
| 3 | Reveal | places 0 Hourglasses (the Badge holder starts with none) | places 0 of their 1 Hourglass | Each Hourglass lowers a character's initiative by 1. The Badge holder chooses first. Had Alicia placed theirs, the Wolfen would have tied the Knight at 3 and gone first, because it placed more Hourglasses. |
| 4 | Showdown | taps **Next** through the steps | — | The Knight acts first: it gains an Hourglass and hits the Wolfen, so the Wolfen is eliminated before it acts and Alicia loses 1 Health. Alicia's Wolfen was aimed at your Seer, which you didn't play, so it would have missed anyway. |
| 5 | Round end | taps **Finish** | — | The Badge changes hands and the set-aside card is shown. A real game goes on, round after round, until someone wins. |

Then the **finished** page (mockup B5): "You've played a whole round", four ticks (three ways to win; planning one character and its targets; Hourglasses and the Badge; who acts first and what a hit does), the reminder that a real game goes on until someone wins, and **Play with a friend** (New game), **Read the rules** (the rules, at "The goal") and **Play the tutorial again**. Reaching it sets the "tutorial finished" flag.

**Only the taught move is enabled.** On each step, every other choice (other hand cards, other targets, other Hourglass counts) is disabled with the coach's reason as its description, so the round always plays out as scripted. This is the UI choosing what to offer; legality still comes from the engine, and the scripted moves must be legal there.

**The coach** (mockups B1–B4) lives in the phase bar, which already holds a step label, an instruction and the action button:

- The step label reads "Tutorial · n of 5 · <title>"; the progress row has five steps.
- The instruction is the coach's text: at most three lines at 360 px and 100 % text in every language, rich text like the rest of the game (bold names, marker tokens).
- The button is either **Next** (explain-only steps) or the real action (Seal plan, Place 0 …).
- The bar title reads "Tutorial".
- What the step is about gets a **dashed ring** (the focus colour, 3 px, offset) — a shape as well as a colour. Rings never pulse with reduced motion.
- The coach text is announced politely when the step changes, and focus moves to the instruction.
- The coach is a component of its own, driven by a step list, so the deferred "Tutorial tips" setting can reuse it in real games later.

**Fitting.** The tutorial's screens are gallery entries (one per step plus the finished page) and go through every layout, wide and accessibility check, in every language and the pseudo-locale, like the other game screens.

### The opponent's name

*(Owner 2026-11-26)* The opponent is **Alicia** in English, and a common name from the language elsewhere: **Lena** in German and **さくら** (Sakura) in Japanese *(my picks; the owner may change them)*.

Each language defines the name once, as a Fluent term in its `ui.ftl`:

```
-tutorial-opponent = Alicia
```

- Every tutorial message names her through the term (`{ -tutorial-opponent }`), never by writing the name out.
- Code never holds the name. The tutorial reads one message, `tutorial-opponent-name = { -tutorial-opponent }`, and uses it as the opponent's display name, so the opponent strip, the plan panels and the log show it like any player's name.
- Changing the name in a language is then one line: that language's `-tutorial-opponent`.
- To keep it that way, the text never refers to her with a pronoun (no "she", "sie", 彼女), so a new name never needs other words changed.
- A test fails if any tutorial message in any language contains the name as written text instead of the term.
- The Japanese name is written in hiragana, which the font subsets already cover. A future name in other characters needs `fonts:ja` run, and the build says so.

### Text and languages

- New Fluent messages in `ui.ftl` for the hub, the six rules pages, the coach, the finished page and Home's panel, in English, German and Japanese. Character names go through `CHARACTER()`; marker names are arguments, so their tokens appear.
- The completeness, count-sweep and pseudo-locale checks cover them automatically.
- Japanese font subsets are regenerated for the new text (`fonts:ja`).

## Testing

- **e2e:** play the whole tutorial from How to play to the finished page in each language, checking each step's coach text, that only the taught move is enabled, and that the result matches the script (Alicia at 1 Health, the Wolfen eliminated). Leaving from every step returns to How to play. The finished flag hides Home's panel.
- **Unit:** the script's moves are legal for its seed (a test plays the script through the engine and fails if the seed or the engine changes the deal); the coach's step machine; the rules routes and Previous/Next.
- **Layout, wide and axe:** the new gallery entries in every language, as above.

## Left to the builder

- The exact wording of every page and coach step (owner reviews the English first).
- How the script is expressed (data, not code paths per step, is preferred) and how it hooks into the local referee and the table.
- Which pictures each rules page uses, from the existing components.
- The seed, found by search.
