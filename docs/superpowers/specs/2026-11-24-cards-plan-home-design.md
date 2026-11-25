# Cards, plan screen and Home: design note

**Date:** 2026-11-24
**Status:** approved by the owner 2026-11-24; recorded in the design spec §8.1 and §8.3
**Applies to:** the layout pass (`docs/superpowers/plans/2026-11-23-layout-pass.md`), reworking Task 4 (cards) and Task 5 (Home) and shaping the plan-screen task
**Visual reference:** `docs/mockups/cards-and-plan.html`, sections A1, G3, H and I (the earlier sections are rejected alternatives)

## Intent

At the Task 5 checkpoint the owner found the cards hard to read and unlike the physical game, the plan screen cramped, and Home cluttered. This note records what replaces them, so the layout pass can resume from settled decisions.

Goals:
- Cards that read like the physical game's cards (same shape everywhere, initiative, name and faction across the top, art, then abilities) without copying its artwork or layout.
- Abilities readable at a glance from icons, using the same three ideas as the physical Player Aid (attack, gain, spend a marker) in our own icons.
- A plan screen that fits 360 × 640 with no scrolling.
- A simpler Home.

Non-goals: new rules, engine changes, or new themes. Anti-goals: the publisher's artwork, card frames or crosshair badges; information shown by colour alone.

## Approaches considered

| Area | Options shown | Chosen | Why |
|---|---|---|---|
| Card style | A1 parchment, A2 night | **A1** | Matches the Moonlit theme's light surfaces; works in light and dark |
| Ability row | Round 1 arrows; P1 tint, P2 burst, P3 swords; G1 swords, G2 bare ▶, G3 explicit; with or without tokens | **G3 with tokens, simplified** (sections H and I): gains as bare green-ringed tokens; attack pills without swords, without ▶ unless there is a cost, without ↻ | Closest to the physical notation with the least ink; circle versus pill already separates gains from attacks |
| Targets | A3 tiles, T1 small cards in rows, T2 overlapping | **T1 with pills** | Targets look like the cards they name; overlap hid names |
| Plan screen | B1 hand at the bottom, B2 two steps, B3 compact row | **B1** | One screen, hand and targets visible together |
| Wolf King's two attack pills | two rows with smaller text; merge pills; widen cards; smaller pills | **One row, same card sizes** | Once gains lost their pill and ▶ and ↻ went, the Wolf King's pills use 85 of 90 px on a medium card and 47 of 52 px on a target card with comfortable padding; the Fool needs no special size |
| Token colour | neutral, tinted per marker | **Neutral** | Shape already distinguishes markers; colour must not carry meaning |

## Decisions

### Card face
- One rounded card shape at every size. Top row: initiative (top left, the same size as the name), name (centred), faction icon (top right; the Fool has none).
- The name is always one line, never wrapped. Medium cards set it at 10 px so "Wolf Beauty" fits; target cards give the name the whole top row and put the initiative and faction icon in the top corners of the art panel (my call: at 58 px there is no room for all three in one row). A test asserts that no name wraps or overflows.
- The art panel is a fixed height for each card size, whatever the ability. Werewolf art panels are hatched; Human ones are tinted.
- Below the art: the ability pills, then the ability text (in our own words).
- Sizes: large 120 × 176 (inspect, reveal), medium 98 × 146 (hand), target 58 × 84.
- Pills always sit on one row, on every card at every size. Padding is about 3 × 6 px inside a pill and 4 px between items on medium cards (2 × 3.5 px and 2 px on target cards); card sizes do not change. A test asserts that no card's pills wrap or overflow.

### Ability pills
- **Gain:** the marker token alone, with a green ring. No pill, no "+".
- **Attack pill:** red tint with a red outline. Contents, left to right: when the attack has a cost, the marker token spent and then ▶; one faction shape per target (shield for Human, claws for Werewolf, "shield / claws" for any character); then a colon and hearts when a hit costs more than 1 Health. No crossed swords.
- Gains and attacks differ by shape (a circle versus a pill holding faction shapes), not only by colour.
- **Wolf King:** a second attack pill, Fang ▶ shield, with no repeat mark; the card text says it applies per Fang spent.
- Pills read in the order the effects happen (Knight: gain Hourglass, then attack).
- The old "?" (an optional Cross spend) is gone: choosing whether to spend is part of every spend.
- Per character (a gain token in braces, an attack pill in brackets): Hunter [Cross ▶ claws claws]; Wolf King [shield] [Fang ▶ shield]; Knight {Hourglass} [claws]; Wolfen {Hourglass} [any]; Seer [claws : heart heart]; Witch {Potion}; Wolf Beauty {Fang} [any]; Villager {Cross}; Fool none.
- Pills are generated from the engine's ability summary; the UI does not restate rules.

### Marker tokens
- Every marker (Cross, Fang, Hourglass, Potion) is drawn on a round neutral token wherever it appears: pills, card text, marker counts, the game log, the legend.
- Hearts are Health, not markers, so they stay bare.
- The gain ring is the only coloured token; everywhere else tokens are neutral.
- In text, the token comes directly before the marker's bold name: "Gain a [token] **Cross**." Faction words stay plain.

### Legend
- A "How to read abilities" legend (gain, attack and target shapes, extra damage, spend) appears in How to play and in the in-game rules sheet, as the physical Player Aid does.

### Targets
- The nine targets are small cards (58 × 84) in two rows (five then four), each showing name, initiative, faction, art and pills; no text. The art panel is shorter on target cards (the same height on all nine) to make room for the pills.
- Chosen: outline and a tick over the art. Not allowed: dimmed. In your hand: a neutral "In hand" pill replaces the ability pills.
- Holding a target or hand card (or focusing it with the keyboard) shows it enlarged; a tap never opens it.

### Plan screen (B1)
- Top to bottom: opponent panel; Targets panel; your 3–4 hand cards at medium size overlapping along the bottom, the chosen one raised; your marker counts and Badge; the phase footer, whose instruction is the plan summary ("**Knight** → **Wolfen** + **Fool**"), with Seal plan. (Builder's call at planning: the mockup needs about 40 px more than 640, so the summary moves from under the targets into the phase bar.)
- Fits 360 × 640 without scrolling.

### Home
- Remove "Play on this device": local play becomes a choice in New game.
- Remove "Rejoin with PIN": Join game handles it (code, then seat, then PIN).
- The title is mixed case ("Werewolf: Duel! Online"), vertically centred with the emblem.

### App bar
- Titles align with the icons by the drawn letters (cap height), not the line box; a test measures the glyphs.

## Left to the builder
- Exact token, pill and gap sizes at each card size, within the mockup's proportions.
- Accessible names for pills (for example "Spend a Cross to attack two Werewolves"), taken from the Fluent strings.

## Next
On approval: add these decisions to the design spec, update the layout-pass plan (rework Tasks 4 and 5; fold the plan screen, targets and legend into the remaining tasks), then resume from Task 6.
