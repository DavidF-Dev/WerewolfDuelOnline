# M5 Languages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The web app and the `wwd` CLI are fully playable in German and Japanese, with grammatical German character names, at the same finish as English.

**Architecture:** First make the English path grammar-ready without changing English output: characters reach Fluent as ids through a `CHARACTER` function, lists format each item in the case their message declares, and rich text keeps a boundary between article and name. Then add locale plumbing (three locales, a completeness check, a pseudo-locale), then the German and Japanese text (Japanese with build-time font subsets), and last run every layout, accessibility and visual check in all languages.

**Tech stack:** Fluent (`@fluent/bundle` in `client-core`, `fluent-bundle` 0.16 in `wwd-cli`), Svelte 5, Vite + `vite-plugin-pwa`, Playwright, Vitest, Rust.

**Spec:** `docs/superpowers/specs/2026-11-26-m5-languages-design.md` (approved), within `docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md` §8.2 and §8.4.

## Global Constraints

- No git state changes by Claude; the owner commits. Implementers never spawn subagents. Playwright suites run one after another, never concurrently.
- Verification. Engine, from `engine/`: `cargo test --workspace --all-features`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, `cargo fmt --check`. App, from `app/`: `pnpm -r build`, `pnpm -r test`, `pnpm -r lint`, `pnpm --filter @wwd/web e2e`, `e2e:online`, `e2e:pwa`, `visual`.
- No sentence is built in code by joining fragments; all wording, including German case and article choices, lives in `.ftl` files. No display strings in the engine.
- Names (owner-approved): DE Jäger (m), Werwolfkönig (m), Ritter (m), Jungwolf (m), Seherin (f), Hexe (f), Wolfsschönheit (f), Dorfbewohner (m), Narr (m); Kreuz, Reißzahn, Sanduhr, Trank, Abzeichen, Leben. JA 狩人, 人狼王, 騎士, 若狼, 占い師, 魔女, 美狼, 村人, 愚者; 十字架, 牙, 砂時計, 薬, バッジ, 体力. "Werewolf: Duel!" stays English everywhere.
- German players: "du/dein" for you, "dein Gegenüber" for the opponent, "Spieler 1" / "Spieler 2" for neutral views. Switches: "AN / AUS" (de), "オン / オフ" (ja). Sentence case applies to English only. German uses "du".
- Bold marks a character's name only, never its article; player words stay bold; marker icons still precede marker names.
- Format locales: `en-GB`, `de-DE`, `ja-JP`; `<html lang>` follows the active language.
- At 100 % text and 360 px wide no real German or Japanese label may end in "…"; at larger text and in the pseudo-locale an ellipsis is allowed.
- English output must not change except where a task says so: the English transcripts and existing English tests stay green.
- Tests must hold on Linux CI (no exact pixel values dependent on font rendering).

## Review Focus

1. **Display names in another script** (a Japanese name while playing in German, or Cyrillic in Japanese): text renders with a fallback font, nothing breaks layout. Test: `a display name outside the active language's script renders and fits` (Task 4).
2. **Switching language mid-game:** the table, log and open sheets re-render in the new language without reload, and the replay of a game recorded in another language reads in the current one. Test: `switching language mid-game re-renders the table and the log` (Task 2).
3. **Browser languages like `de-AT`, `ja-JP`, `en-US` and `fr`**: System picks Deutsch, 日本語, English, English. Test: `system language picks the first supported browser language` (Task 2).
4. **Saved games and backups across languages:** a backup exported in German imports in Japanese with nothing lost; nothing language-specific is stored in sessions or history. Test: `backups and sessions carry no language text` (Task 2).
5. **Plurals and counts in German and Japanese** (1 Kreuz / 2 Kreuze; Japanese counters): every message with a count formats for 0, 1, 2 and 5. Test: covered by the completeness check's count sweep (Task 2) and the transcripts (Tasks 3, 4).

---

### Task 1: Grammar-ready English (no visible change)

**Files:** `engine/locales/en/engine.ftl`, `app/packages/client-core/src/{i18n.ts,render-event.ts,rich-text.ts}`, `engine/crates/wwd-cli/src/render.rs`; tests in `app/packages/client-core/test/{perspective,rich-text,i18n}.test.ts` and the CLI's tests.

**Interfaces (Produces):**
- A Fluent function registered in both bundles: `CHARACTER(id: string, { case?: 'nom'|'acc'|'dat'|'gen', article?: 'def'|'indef'|'none' })`. It reads the forms from the active locale's character message (`character-<id>` with attributes; storage within the `.ftl` is the builder's choice) and returns the form; English returns today's text for every option combination.
- Messages that take a list of characters may declare `.list-case` and `.list-article` attributes; `client-core`'s `list()` and the CLI's `character_list`/plan targets read them and format each item with `CHARACTER` before joining with `Intl.ListFormat` / the CLI equivalent.
- Rich text: the formatted form carries a boundary so `RichPart` marks exactly the name as `{ character }` and leaves the article as plain text.

- [ ] **Step 1: Write failing tests:** `CHARACTER returns each form from the locale file` (a test-only locale with forms), `a list takes the case its message declares` (test locale: `.list-case = acc` yields accusative items), `rich text bolds the name and not its article` (test locale), and `English transcripts are unchanged` (snapshot the existing English transcripts and CLI output before the change).
- [ ] **Step 2: Run them.** Expected: the first three FAIL; the snapshot passes on the old code.
- [ ] **Step 3: Implement** in `client-core` and the CLI, passing character ids (not names) into messages that mention characters, and updating `engine.ftl` English messages to call `CHARACTER`.
- [ ] **Step 4: Run** all engine checks and `pnpm -r test`, `lint`, `e2e`, `e2e:online`. Expected: PASS with English output identical.
- [ ] **Step 5: Commit.** `refactor(i18n): characters reach messages as ids with grammatical forms`.

---

### Task 2: Three locales, language choice and the checks

**Files:** `app/packages/engine/scripts/build.mjs` (all locales), `app/packages/client-core/scripts/gen-ui-ftl.mjs`, `client-core/src/i18n.ts` (`createLocaliser(locale: Locale)`, `type Locale = 'en' | 'de' | 'ja'`), `app/apps/web/src/settings/{settings.ts,apply.ts}`, `screens/Settings.svelte`, `index.html`/app shell (`lang`), the CLI (`--lang en|de|ja`), new `scripts/pseudo-locale.mjs` (or inside client-core), `client-core/test/i18n.test.ts`, `.github/workflows/app.yml` if CI needs a step; seed `de/` and `ja/` folders with the English text as placeholders so everything compiles.

**Interfaces (Produces):** `type Locale = 'en' | 'de' | 'ja'`; `createLocaliser(locale: Locale): Localiser` with `locale` `en-GB`/`de-DE`/`ja-JP`; settings `language: 'system' | 'en' | 'de' | 'ja'`; `resolveLanguage(setting, navigatorLanguages: readonly string[]): Locale`; a `pseudo` locale available only in tests and the visual script.

- [ ] **Step 1: Write failing tests:**
  - `every locale has every message with the same placeholders` (ids, variables and required attributes match English; no extras); temporarily marked to check `de` and `ja` only once Tasks 3 and 4 fill them (use an allow-list that Tasks 3 and 4 empty).
  - `every count message formats for 0, 1, 2 and 5 in every locale`.
  - `system language picks the first supported browser language` (`['de-AT','en']`→de, `['ja-JP']`→ja, `['en-US']`→en, `['fr','de']`→de, `['fr']`→en).
  - `the language list names each language in itself` ("System (Deutsch)" when the browser is German; options English, Deutsch, 日本語).
  - `switching language mid-game re-renders the table and the log` (e2e).
  - `backups and sessions carry no language text`.
  - `html lang follows the active language`.
  - `the pseudo-locale lengthens every message by about 30 % and keeps placeholders`.
  - CLI: `wwd --lang de prints German` once Task 3 lands; here `--lang` parses and selects the locale.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The sentence-case test now runs for `en` only. Keep the English default everywhere.
- [ ] **Step 4: Run** all checks. Expected: PASS (German and Japanese still show English placeholder text).
- [ ] **Step 5: Commit.** `feat(i18n): German and Japanese locales, language choice and checks`.

---

### Task 3: German

**Files:** `engine/locales/de/engine.ftl`, `app/packages/client-core/locales/de/ui.ftl`; tests.

- [ ] **Step 1: Write failing tests:** remove `de` from Task 2's allow-list; `every German character resolves in every case and article`; `every event names the right player's character from every perspective` runs in German; `a German CLI transcript of a seeded game` (snapshot, reviewed by eye once); `no German label ends in an ellipsis at 100 % and 360 px` (Playwright over every gallery entry with `de`).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Translate** every message: names, genders and forms; the players' words; "du"; "AN / AUS"; German capitalisation; list attributes on list messages. Shorten any label the ellipsis test flags.
- [ ] **Step 4: Run** all checks, then `visual` with German and look at every entry. Expected: PASS; German screens fit 360 × 640.
- [ ] **Step 5: Commit.** `feat(i18n): German`.

---

### Task 4: Japanese and its fonts

**Files:** `engine/locales/ja/engine.ftl`, `client-core/locales/ja/ui.ftl`; `app/apps/web/scripts/subset-ja-fonts.mjs` (build-time subset of BIZ UDPGothic 400/700 and Shippori Mincho B1 to the glyphs of every Japanese `.ftl` string plus kana, ASCII and common punctuation), `src/theme/fonts.ts` (load the Japanese faces only when the locale is `ja`), `theme/base.css` (`:lang(ja)`: `word-break: auto-phrase`, line-height 1.7, the Japanese font stacks), `vite.config.ts` (precache or runtime-cache the subset files so Japanese works offline after first use), `credits.ts` (licences); tests.

**Interfaces:** the font loader gains a `japanese` entry alongside the reading fonts; the subset script runs as part of `pnpm build` and fails if a Japanese string contains a glyph missing from the subset.

- [ ] **Step 1: Write failing tests:** remove `ja` from the allow-list; `every event names the right player's character from every perspective` in Japanese; `a Japanese CLI transcript of a seeded game`; `no Japanese label ends in an ellipsis at 100 % and 360 px`; `Japanese fonts load only when Japanese is active` (no Japanese font request in English or German); `Japanese text works offline after first use` (pwa suite); `the subset covers every Japanese string`; `a display name outside the active language's script renders and fits` (Review Focus 1).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Translate and wire the fonts.** Plain polite Japanese; "オン / オフ"; no faux bold.
- [ ] **Step 4: Run** all checks, then `visual` in Japanese and look at every entry. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(i18n): Japanese with build-time font subsets`.

---

### Task 5: Every check in every language, and docs

**Files:** `e2e/layout.spec.ts`, `e2e/wide.spec.ts`, the axe spec, `scripts/visual.mjs` (`--lang en|de|ja|pseudo|all`), `.github/workflows/app.yml` (run the layout suite with the pseudo-locale), spec §8.2/§8.4, `CLAUDE.md` (the `visual --lang` option), `README.md` (languages).

- [ ] **Step 1: Write failing tests:** parameterise the layout, robustness (320 px, 150 %, long name), wide and axe suites over `en`, `de`, `ja`; add the pseudo-locale run that checks overflow and scrolling only (ellipsis allowed).
- [ ] **Step 2: Run them.** Expected: FAIL wherever a screen breaks in another language.
- [ ] **Step 3: Fix** what they find (shorter wording first, layout second); update the spec, CLAUDE.md and README.
- [ ] **Step 4: Run** everything, sequentially. Expected: PASS; CI time stays reasonable (if the matrix makes the app job much slower, run the de/ja/pseudo layout runs only on the desktop project and say so in the report).
- [ ] **Step 5: Commit.** `test(i18n): layout, accessibility and visual checks in every language; docs`.
