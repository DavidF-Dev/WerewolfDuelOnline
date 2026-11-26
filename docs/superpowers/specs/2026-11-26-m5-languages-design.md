# M5 languages: German and Japanese — design

**Date:** 2026-11-26
**Status:** approved by the owner 2026-11-26
**Milestone:** M5 "Reach" (spec §10), first of four projects, in this order: languages → rulebook and tutorial → the deferred gameplay settings → the accessibility audit. Each has its own design and plan; this note covers languages only.
**Builds on:** spec §8.4 (localisation and perspective), §8.2 (the Language setting).

## Intent

Make the whole game playable in German and Japanese, at the same finish as English, so players who don't read English can play. The owner will ship Claude's translations as they are, with no "beta" label.

## Goals

- Every string a player sees in the web app, and every message the `wwd` command-line tool prints, exists in English, German and Japanese.
- German game text is grammatical: character names take the right article and case ("Der **Ritter** trifft den **Jungwolf**").
- Language "System" follows the browser; the language list names each language in itself.
- Every screen still fits 360 × 640 with no scrolling in all three languages.

## Non-goals

- The rulebook and tutorial (the next M5 project translates its own text).
- Any language beyond German and Japanese; right-to-left support.
- Translating player-entered text (display names).

## Anti-goals

- Building sentences in code by joining fragments (CLAUDE.md; spec §8.4). All wording stays in Fluent files.
- Display strings in the engine. It keeps emitting ids.
- English players downloading Japanese fonts.
- Colour or font alone carrying meaning (unchanged rule).

## Constraints

- Fluent everywhere: the web app (`@fluent/bundle` in `client-core`'s `createLocaliser`) and the CLI (`fluent-bundle` 0.16 in `wwd-cli`) read the same `.ftl` files: `engine/locales/<lang>/engine.ftl` (events, errors, character names; ~317 lines in English) and `app/packages/client-core/locales/<lang>/ui.ftl` (the app; ~685 lines).
- Today both are English only: `createLocaliser(locale: 'en')`, `FORMAT_LOCALES = { en: 'en-GB' }`, the Language setting is `'system' | 'en'`, `index.html` has `lang="en-GB"`, and the CLI includes only English.
- Perspective rules stay (§8.4): each seat is an argument selecting "you" / "your opponent" / "Player 1" variants; player words and character names are bold; marker names are arguments so rich text puts their icon before them.
- Fonts (§8.4): Japanese body BIZ UDPGothic and headings Shippori Mincho B1; Latin keeps Atkinson Hyperlegible Next and Marcellus. Self-hosted `@fontsource`, OFL. Japanese uses `lang="ja"`, `word-break: auto-phrase` and line-height 1.7.
- Tests must hold on Linux CI (fonts render differently there; no exact pixel assertions).

## Approaches considered (German grammar for character names)

- **A: name forms in the Fluent files — chosen by the owner.** Each German character message carries its grammatical gender and its forms for each case as attributes; one small helper, registered as a Fluent function in both the web app and the CLI, picks the right form for each place in a message. English and Japanese ignore the extra forms. Standard Fluent, no new tool, translators fix forms without touching code.
- B: rephrase German sentences so names never inflect ("Treffer: Wolfen (von Ritter)"). Simpler, but every line of game text reads like a log.
- C: build German phrases in code. Rejected: breaks the no-concatenation rule and needs code changes for every grammar fix.

## Decisions

### Names (owner-approved)

| English | German | Japanese |
|---|---|---|
| Hunter | Jäger (m) | 狩人 |
| Wolf King | Werwolfkönig (m) | 人狼王 |
| Knight | Ritter (m) | 騎士 |
| Wolfen | Jungwolf (m) | 若狼 |
| Seer | Seherin (f) | 占い師 |
| Witch | Hexe (f) | 魔女 |
| Wolf Beauty | Wolfsschönheit (f) | 美狼 |
| Villager | Dorfbewohner (m) | 村人 |
| The Fool | Narr (m) | 愚者 |
| Cross · Fang · Hourglass · Potion | Kreuz · Reißzahn · Sanduhr · Trank | 十字架 · 牙 · 砂時計 · 薬 |
| Badge · Health | Abzeichen · Leben | バッジ · 体力 |

- The game's title "Werewolf: Duel!" stays in English in every language; the unofficial notice and the publisher credit are translated.
- The character reference (How to play) shows the English printed name beside the translated one in German and Japanese, for players who own the physical game.
- If a printed German or Japanese edition with its own names is found later, its names replace these.

### Grammar

- Character names are passed to messages as ids, not as text. A Fluent function (working name `CHARACTER`) takes the id and named options for case (`nom`, `acc`, `dat`, `gen`) and article (`def`, `indef`, `none`) and returns the form from the active language's file; English and Japanese return the name (English keeps its current "the" handling in the message text).
- Messages that need a pronoun or agreement with a character select on the character's gender attribute.
- **Bold is on the name only** *(my call)*: "trifft den **Jungwolf**". The article is never bold, so the form the function returns keeps a boundary rich text can split on; rich text marks exactly the character's name and the player words, and still puts marker icons before marker names. The perspective test treats the bold part as the name.
- **Lists of characters** (the hand dealt, plan targets, the revealed plans, plan summaries) *(my call)*: lists stay joined by `Intl.ListFormat` in the app and its equivalent in the CLI, as the spec says. Each message that takes a list declares, in its own language file, the case and article its list items need (an attribute such as `.list-case = acc` and `.list-article = def`); the code reads that attribute, formats each item with the character function in that form, then joins them. Grammar stays in the language files; the code only follows what the message declares. English and Japanese declare nothing.
- The same function, forms and list rule are used by the CLI, so `wwd` output in German is as grammatical as the app's.
- **How the forms are stored** *(decided in Task 1)*: the function is `CHARACTER($id, case: "acc", article: "def")`; both options are optional and default to `nom` and `none`, and an unknown case, article or id is a formatting error (the message falls back to its id). A character message's value is its nominative name; attributes `.nom`, `.acc`, `.dat` and `.gen` give the name in another case where it differs (e.g. `.gen = Jägers`), and `.gender` its gender. One message per language, `grammar-character-form` (named outside the `character-` ids so nothing mistakes it for a character; renamed from `character-form` in Task 2), takes `$name` (the name in the case), `$case`, `$article` and `$gender` and places the article; English and Japanese define it as `{ $name }`. The name is always the `$name` placeable, which is the boundary rich text splits on: the app's `CHARACTER` marks only `$name`, so the article stays plain.
- *(Task 1)* List items are formatted in the declared form before the list is joined. A plan's target list item goes through `target-character` (given the name already in that form) or `target-fool` (given `$case` and `$article`), so English keeps "the". Messages take character ids (`wolf_king` or `wolf-king`), never names; the bare names in headings, cards and labels stay the message value.
- *(Task 2)* **Selecting on gender:** `GENDER($id)` gives a character's `.gender` (`masculine`, `feminine` or `neuter`), or `none` when its message has none, for a message to select on (`{ GENDER($character) -> [feminine] … *[other] … }`); an unknown id is a formatting error. Registered in the app and the CLI.
- *(Task 2)* **A form that cannot be formatted** (a broken `grammar-character-form`, an unknown id) fails the same way in the app and the CLI: the message naming the character falls back to its id. For a list, that is the message taking the list (`event-hand-dealt`, `cli-your-hand`, `plan-targeting`, …). A locale without `grammar-character-form` gives the bare name in every form. The app formats each character's form once per localiser and keeps it.
- *(Task 2)* The CLI joins lists with the locale's words: `cli-list-two`, `cli-list-start`, `cli-list-middle` and `cli-list-end` (CLDR's list patterns), as the app does with `Intl.ListFormat` in the format locale.
- **The players in German** *(my call)*: "du/dein" for you, "dein Gegenüber" for the opponent (gender-neutral and natural at a game table), and "Spieler 1" / "Spieler 2" for neutral views. Pronouns and possessives agree with these nouns. German gets whichever extra player-word variants this needs beyond the six English ones.

### Choosing a language

- Settings → Language lists "System (…)", "English", "Deutsch", "日本語". "System" picks the first of the browser's languages that the game offers (`en*`, `de*` or `ja*`, so `en-US, de` stays English), else English, and shows which in its label (e.g. "System (Deutsch)"); it follows the browser when its languages change. An unknown stored language reads as System. A change of language re-renders every screen in place, so a game, the log and an open sheet carry on in the new language.
- Dates, times and lists use `de-DE` and `ja-JP` (English stays `en-GB`). `<html lang>` follows the active language.
- *(Task 4)* **German and Japanese text loads when chosen.** English is in the start-up bundle; each other language's engine and interface text is a module of its own (`loadEngineFtl`, `loadUiFtl`), fetched by `loadLocale(locale)` the first time it is chosen. `createLocaliser` needs the text loaded. A switch keeps the current language until the new one's text is in, and the last choice wins; the app waits for the stored language before it draws its first screen. The service worker precaches these modules with the rest of the scripts, so switching language works offline.
- The CLI gets a `--lang en|de|ja` option (default English), accepted before or after the subcommand. *(My call)* It translates everything the game prints: events, errors, prompts and status lines. Its `--help` and usage text, argument-error text, and the words a player types (commands such as `q`, and the edit-script syntax) stay English, like the command names themselves.

### Fonts and layout

- Japanese fonts load only while Japanese is active; English and German players download nothing new. *(My call, following the spec's "subset at build time")* The build makes one subset per Japanese font weight containing every glyph the app's Japanese text uses, plus kana and common punctuation. Choosing Japanese fetches those few files and keeps them for offline play, so all app text works offline. Characters outside the subset (for example in a player's display name) fall back to the system's Japanese font.
- Japanese text: `word-break: auto-phrase`, line-height 1.7. Bold Japanese uses the font's bold weight, not faux bold.
- *(Task 4)* **How the subsets are made.** The subsets of BIZ UDPGothic 400 and 700 and Shippori Mincho B1 700 are committed in `app/apps/web/src/theme/ja-fonts/` with a `manifest.json` giving each file's SHA-256 and the characters it maps. Before `dev`, `build` and `test`, `scripts/check-ja-fonts.mjs` checks that each file matches the manifest and that together they cover every character of the Japanese `.ftl` files and the language names, plus ASCII, kana, full-width digits and common punctuation; it fails, naming the characters, and asks the developer to run `pnpm --filter @wwd/web fonts:ja`. That command (`scripts/subset-ja-fonts.mjs`) is the only one that needs the full source fonts: it installs them and `subset-font` (HarfBuzz), with every package of the tree at an exact version, into a temporary folder, subsets with HarfBuzz, rewrites the files and manifest, and removes the folder. Fontsource ships these families only as pre-split unicode-range chunks, so the source fonts are the `@expo-google-fonts` packages (the same Google Fonts files, OFL); they are not dependencies of the app. BIZ UDPGothic must map every character; Shippori Mincho B1 may lack one (such as "↗") that BIZ UDPGothic has, since every Mincho stack names BIZ UDPGothic next. *(Task 4 fix round 1)* The covered text also includes everything the `ja-JP` formatters write (relative times, dates in every style the app uses and those near them, numbers, lists, swept over sample values), the date words (年月日時間分秒前後週曜…) and all full-width ASCII forms. *(Final fix wave)* The formatter output is recorded as `intl` in `manifest.json` when the subsets are regenerated, and the check covers that recorded text rather than what the running Node prints, so a newer Node with newer ICU data cannot fail the build; the unit test of the app's own date, number and list output still uses the running Node. The subsets keep the copyright, licence and name records (name IDs 0–6, 13, 14) and drop hinting; `OFL.txt` beside them carries both copyright lines and the licence, and the check fails without it.
- *(Task 4)* **Stacks.** Under `:lang(ja)` the body is BIZ UDPGothic, headings and labels Shippori Mincho B1, and the app bar's display face keeps Marcellus for its Latin title with Shippori Mincho B1 after it. A chosen reading font (Lexend, OpenDyslexic) comes first, with BIZ UDPGothic as its fallback. Only one Shippori weight is shipped (700); text set at 400 in a label face uses it rather than a synthesised weight.
- *(Task 4)* **Loading and offline.** Choosing Japanese adds the three faces with the `FontFace` API and fetches them together. The service worker's font cache (cache-first, same-origin fonts) serves them from then on; since a first visit is not yet controlled by the worker, the page also puts them in that cache itself, so Japanese works offline after its first use even then. The worker does not precache them, so English and German players never download them. The page also removes the subsets of earlier builds from that cache, since the worker's expiry does not track entries the page wrote. A face that failed to load is replaced on the next try; one that loaded is kept.
- Long German labels rely on the auto-fit action (labels shrink to 80 %, then ellipsis) and wrapping where text may wrap.
- *(Owner, 2026-11-26: "Allow smaller names")* A card's name may shrink to 75 % of its size (every other fitted label keeps 80 %), so the approved "Wolfsschönheit" fits on a medium card at 360 px without an ellipsis.
- *(My call)* At 100 % text, no real German or Japanese label may end in "…" at 360 px wide: a translation that doesn't fit is shortened until it does, and the layout tests assert it. At larger text sizes, and in the pseudo-locale, an ellipsis is allowed; those runs check only that nothing overflows or scrolls where it shouldn't.

### Text conventions per language

- The "sentence case" rule and its test apply to English only. German follows German capitalisation (all nouns); Japanese has none.
- Switch states: "ON / OFF" in English, "AN / AUS" in German, "オン / オフ" in Japanese.
- British English stays the source language; German and Japanese are written from it, in the same voice: plain, friendly, second person ("du" in German, plain polite form in Japanese).

### Checks

- **Completeness:** every message id in English exists in German and Japanese, with the same placeholders and the same attributes where required; no extra ids. Fails the build. *(Task 2)* A translation may also use the arguments the code passes that English ignores (the player words in event messages; `case`, `article` and `gender` where given) and may add only the grammar attributes: `.list-case` and `.list-article` on list messages, with a known case and article, and `.gender` (a known gender) and case forms on character messages; `CHARACTER` and `GENDER` calls must take one variable and known options. A separate check, run per language once it is translated (Tasks 3 and 4 take theirs off an allow-list), requires every message with words to differ from English, except names kept in every language. Every message with a count formats for 0, 1, 2 and 5 in every language.
- **Grammar coverage:** every character in every case and article form resolves in every language; the perspective test (every event from p0, p1 and neutral views) runs in all three languages and checks each character name sits next to its owner's seat words.
- **Pseudo-locale in CI:** a generated language that lengthens every string by ~30 % and adds accents runs through the screen-fit and overflow tests, so a too-long translation can't quietly break a screen. *(Task 2)* It is made at run time from the English messages (`@wwd/client-core/pseudo`): each text gets accented letters and `~` padding of 30 % of its length, while placeholders, selectors and the keyword attributes (`.gender`, `.list-case`, `.list-article`) stay as they are. It is never in the language list: development builds reach it through the gallery (`#/dev/gallery/<entry>?lang=pseudo`, and `?lang=de` or `ja` for a real language), `pnpm --filter @wwd/web visual --lang pseudo`, and `window.__wwd.language('pseudo')`.
- **Real languages:** the layout tests (360 × 640, 390 × 844, 320 px wide, 150 % text) and axe run in German and Japanese too; the visual script gains a language option so the owner can see every screen in each language. *(Task 5)* The layout suite's game-screen fit (360 × 640 and 390 × 844), 150 % text, 320 px overflow, and 150 % text with a 24-character name checks run in `en`, `de`, `ja` and the pseudo-locale; the one-line label, plan panel, Badge, settings row, Play hint and unofficial-notice checks, the wide-screen checks and the gallery's axe checks run in `en`, `de` and `ja`. They are all desktop-project tests, as before. The pseudo-locale runs are tagged `@pseudo` and CI runs them as a step of their own. `visual --lang all` draws every language, each into a folder of its own under one index. *(Task 5)* The pseudo-locale's padding is a run of short `~` words after the text (`Bàçk ~`), not tildes glued to the last word, so a word keeps its own length and a line breaks where English would. The 320 px check also fails a panel whose content spills past its sides. What the runs found, and the fixes (wording first): German "Du hast in Runde 2 das Abzeichen." for the round summary; Japanese 「アプリ」 for the Install row (beside its 「インストール」 button), 「相手が出していれば、何よりも先に脱落します。」 for the Potion hint, and 「{ $step }/{ $total }・第{ $round }ラウンド」 for the replay position, which had wrapped to two lines. Layout changes: once the showdown runs short of room, an eliminated character's step collapses to one line like the other earlier steps, and the round summary draws its set-aside card at 60 %; the opponent's Hourglass caption on the reveal is a fitted one-line label; the stats table's cells have 4 px side padding instead of 6 px, so the German character table fits its panel at 320 px. *(Task 5 fix round)* Once short of room the plan panels' cards are also drawn at 75 %, so the text beside them gets about 14 px more width; a German showdown with 24-character names must fit at 100 % (replay-showdown, table-round-summary); an inspect popover undoes any zoom it inherits; the German "Showdown speed" setting is „Ergebnisse“ ("Tempo der Auflösung" pushed its control under the name with Linux font metrics; the owner chose „Ergebnisse“, the results the setting paces, over the first fix „Auflösung“). Checked on Linux Chromium: the whole layout suite and the gallery, wide and card suites pass; German margins at 360 × 640 are the same as on Windows.
- **CLI:** snapshot tests of a seeded game's transcript in each language.

## Left to the builder

- The exact Fluent function name and option names, and how forms are stored (attributes on the character message, or separate terms), within "forms live in the language files".
- How the formatted form carries the boundary between article and name for rich text.
- How the pseudo-locale is generated and wired into CI.
- Whether the visual script's language option renders all languages or one at a time.
