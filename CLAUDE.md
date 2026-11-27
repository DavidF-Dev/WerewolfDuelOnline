# Werewolf: Duel! Online

**Werewolf: Duel! Online** is an unofficial digital version of the two-player bluffing card game *Werewolf: Duel!* by Whales Entertainment. It is played in the browser on desktop and mobile as an installable PWA. Friends connect with a join code. A server-side **referee** runs the rules engine and sends each player only their own view.

**Status:** M1 (the rules engine and `wwd` CLI in `engine/`), M2 (WASM bindings, protocol, referee core, client core and an unstyled two-tab web table in `app/`), M3 (online play: the Node and Cloudflare referees, join codes, reconnection, seat PINs, the mobile lifecycle, and the deploy workflow and guide in `docs/deploy.md`) and M4 (the product: every screen in the Moonlit theme, settings, pause and resume including from a save file, rematch, history with replays and stats, backups, and the installable PWA with an offline shell) are complete. M5's first project, languages (German and Japanese across the app and `wwd`), is complete, and so are the playtest fixes (in-hand targets are illegal, engine 0.3.0 and protocol 4; the plan screen, hand, marker and reveal and showdown changes). M5's second project, the rulebook and tutorial (How to play as a hub, six rules pages, and a coached tutorial round, in all three languages), is complete. The next step is the design for the deferred gameplay settings.

## Documents (read these first)

| Document | Purpose |
|---|---|
| [`docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md`](docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md) | **The design spec.** §5 is the authoritative rules specification for the engine |
| [`docs/superpowers/plans/2026-11-22-m1-engine.md`](docs/superpowers/plans/2026-11-22-m1-engine.md) | Implementation plan for M1 (engine + CLI) |
| [`docs/superpowers/plans/2026-11-23-layout-pass.md`](docs/superpowers/plans/2026-11-23-layout-pass.md) | Implementation plan for the layout pass |
| [`docs/superpowers/specs/2026-11-24-cards-plan-home-design.md`](docs/superpowers/specs/2026-11-24-cards-plan-home-design.md) | Design note for the cards, the plan screen and Home |
| [`docs/superpowers/specs/2026-11-26-m5-languages-design.md`](docs/superpowers/specs/2026-11-26-m5-languages-design.md) | Design note for M5 languages: German and Japanese grammar, fonts, checks |
| [`docs/superpowers/plans/2026-11-26-m5-languages.md`](docs/superpowers/plans/2026-11-26-m5-languages.md) | Implementation plan for M5 languages |
| [`docs/superpowers/specs/2026-11-27-playtest-fixes-design.md`](docs/superpowers/specs/2026-11-27-playtest-fixes-design.md) | Design note for the playtest fixes: in-hand targets, the plan screen, the hand, markers, the reveal and showdown sides |
| [`docs/superpowers/plans/2026-11-27-playtest-fixes.md`](docs/superpowers/plans/2026-11-27-playtest-fixes.md) | Implementation plan for the playtest fixes |
| [`docs/superpowers/specs/2026-11-26-m5-rulebook-tutorial-design.md`](docs/superpowers/specs/2026-11-26-m5-rulebook-tutorial-design.md) | Design note for the M5 rulebook and tutorial: the rules pages, the coached tutorial, the opponent's name |
| [`docs/superpowers/plans/2026-11-26-m5-rulebook-tutorial.md`](docs/superpowers/plans/2026-11-26-m5-rulebook-tutorial.md) | Implementation plan for the M5 rulebook and tutorial |
| [`docs/research/2026-11-21-research-and-recommendations.md`](docs/research/2026-11-21-research-and-recommendations.md) | Background research, alternatives considered, sources |
| [`docs/mockups/mockups.html`](docs/mockups/mockups.html) | Low-fidelity screen mockups (open in a browser) |
| [`docs/mockups/cards-and-plan.html`](docs/mockups/cards-and-plan.html) | Card and plan-screen mockups; sections H and I are binding |
| `rulebook.pdf`, `cards.pdf` | The physical game's rulebook and card scans. Reference only: git-ignored, never commit or reproduce them |

## Layout

```
engine/   Rust workspace: wwd-core (rules library), wwd-cli (`wwd` binary), wwd-wasm (bindings)
app/      TypeScript pnpm workspace: engine, protocol, transport, referee-core, referee-memory, referee-service, referee-node, referee-cloudflare, client-core, apps/web (Svelte 5 + Vite PWA; its Playwright suites are in `apps/web/e2e`)
scripts/  smoke.mjs: post-deploy smoke test of a referee
docs/     spec, plans, research, mockups, deploy guide
.github/  workflows: engine, app (including the `docker` job), deploy; actions/setup-app (shared toolchain set-up)
```

## Commands

Prerequisites: Rust stable with the `wasm32-unknown-unknown` target, Node 24, pnpm 10 and `wasm-bindgen-cli` 0.2.129 (the version pinned in `engine/crates/wwd-wasm/Cargo.toml`): `cargo install wasm-bindgen-cli --version 0.2.129 --locked`.

Engine, from `engine/`:
- Test: `cargo test --workspace --all-features`
- Lint: `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- Format check: `cargo fmt --check`

App, from `app/`:
- `pnpm install`
- `pnpm build` (builds the engine package first)
- `pnpm test`
- `pnpm lint` (`tsc`/`svelte-check` plus `prettier --check`)
- `pnpm --filter @wwd/web e2e` (Playwright; first run `pnpm --filter @wwd/web exec playwright install chromium`)
- `pnpm --filter @wwd/web e2e:online` (Playwright vs a Node referee started in-process, including the axe accessibility checks)
- `pnpm --filter @wwd/web e2e:pwa` (Playwright vs a production build served by `vite preview`: the offline shell)
- `pnpm --filter @wwd/web e2e:parity` (the `@parity` subset vs `wrangler dev`; local workerd, no account)
- `pnpm --filter @wwd/web fonts:ja` (regenerates the committed Japanese font subsets in `apps/web/src/theme/ja-fonts/` after Japanese text changes; it installs the exact-pinned source fonts into a temporary folder. `dev`, `build` and `test` fail, naming this command, when a Japanese character is missing from the subsets)
- `pnpm --filter @wwd/web icons` (renders the app icon PNGs from its SVG with Playwright's Chromium)
- `pnpm --filter @wwd/web visual` (draws every gallery entry at four sizes in light, dark and high contrast, beside the mockups, into `apps/web/visual-output/`; open its `index.html`. `--lang de`, `ja` or `pseudo` draws them in that language, and `--lang all` in every language, each in a folder of its own)
- `pnpm --filter @wwd/web transcript` (writes three seeded games as Markdown logs, one per view, into `apps/web/visual-output/transcripts/`; `--search` finds seeds for its scenarios, and `--lang de` or `ja` writes them in that language into `transcripts-de/` or `transcripts-ja/`)
- `pnpm --filter @wwd/web tutorial:seed` (searches for the seed that deals the tutorial its hands; run it when the tutorial's script test says the seed no longer does)
- `pnpm --filter @wwd/web dev` (dev server; `window.__wwd` is available only here). It uses the referee at `http://localhost:8787`, so start one of:
  - `pnpm --filter @wwd/referee-node start --test-overrides` (the Node referee; add `--port`, `--data`, `--origins` as needed)
  - `pnpm --filter @wwd/referee-cloudflare dev` (`wrangler dev` in local workerd, with test overrides; never deploys)
- `BASE_PATH=/<repo> pnpm --filter @wwd/web build` (a build served under a sub-path, as on a GitHub Pages project site)

Smoke test, from the repository root: `node scripts/smoke.mjs <referee-url>` (for example `http://localhost:8787`). It makes four requests (up to seven while retrying `/health`) and creates one room. Deployment is in `docs/deploy.md`; never deploy to Cloudflare from a dev machine except as described there.

## Ground rules

- **The engine is the only authority on rules.** The UI and referee never re-implement them; they use `legal_actions()`, `apply()` and `view()`.
- **Hidden information must never reach the wrong player.** Data leaves the engine only through `view(state, viewer)` and visibility-filtered events.
- **Determinism:** in the engine, no `HashMap`/`HashSet`, floats, clock, environment, locale, or unseeded randomness.
- **No display strings in the engine.** It emits IDs, and all text lives in Fluent `.ftl` files (EN, DE, JA).
- **No Cloudflare-specific code outside the Cloudflare adapter.**
- **IP:**
  - Use the character role names as printed.
  - Write rules text in our own words.
  - Don't use the publisher's artwork or card layouts; use placeholder shapes and CC0/CC-BY icons with credits.
  - Always show the "unofficial" notice.
- **Accessibility:** never convey information by colour alone. Respect reduced motion. Keep the DOM semantic, since agents and screen readers rely on the accessibility tree.
- **Testing:** test-driven development throughout. Every rule must map to a named test. Use the in-memory and local servers; never test against the Cloudflare quota.

## Workflow

### Source control
- **Don't run `git init`, create commits, or push unless the user asks.** The user manages the repository.
- Follow the current milestone plan task by task. Record new decisions in the spec rather than only in chat.

### Naming conventions
- **British English** in identifiers, comments and user-visible strings (`Colour`, not `Color`).
- **User-facing string casing:** sentence case. Capitalise the first letter and proper nouns; everything else is lowercase. Exception: discrete state indicators (toggle `ON` / `OFF`) stay ALL CAPS.
- **C# code** follows C# language conventions: `PascalCase` for types and members, `camelCase` for locals, `_camelCase` for private fields.

### Code
- Write code to an industry standard, using best practices.
- Avoid creating garbage in hot paths (code that runs every frame). Flag any case where you think creating garbage is acceptable.
- Write tests where you see fit.

### Comments
- Write conservatively. Default to no comment; add one only when the *why* is non-obvious (a hidden constraint, a subtle invariant, a workaround for a specific bug).
- When a comment is warranted, keep `//` comments to a single concise line.
- Class and method `///` summaries may be multi-line.
- Describe what the target *is* or *does*; broader context belongs in external docs, not in code comments.
- Keep comments self-contained and stable.
- **Comments must not have dependencies.** The test: a comment should not need editing unless the code immediately below it changes.
- A reader who has never seen the rest of the codebase should be able to verify the comment against the local code alone.
- Do not refer to file paths or file names.