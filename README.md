# Werewolf: Duel! Online

**An unofficial digital version of Werewolf: Duel!**, the two-player bluffing card game by Whales Entertainment. Play it with a friend in the browser, on desktop or mobile: one player creates a game and the other joins it with a short join code or an invite link.

**Play: [werewolf-duel.davidfdev.com](https://werewolf-duel.davidfdev.com)**

> This is an unofficial fan project. It is not affiliated with or endorsed by Whales Entertainment or the designers of Werewolf: Duel!. It uses the character role names as printed but none of the publisher's artwork, card layouts or rulebook text.
>
> If you enjoy it, [get the physical game ↗](https://boardgamegeek.com/boardgame/436306/werewolf-duel#buyacopy).

## How it works

- **Rules engine:** a deterministic Rust library (`engine/`) is the only authority on the rules. It also builds to WebAssembly and has a command-line tool, `wwd`, for playing, replaying and verifying games at the terminal.
- **Referee:** a small server runs the engine and sends each player only their own view, so hidden cards never reach the other player. It runs on Cloudflare Workers, or self-hosted as a Node server or Docker container.
- **Web app:** a Svelte app served from GitHub Pages. If a connection drops, it reconnects, and a seat PIN lets a player continue on another device.

## Languages

The app and the `wwd` tool speak English, German and Japanese. The app follows the browser's language unless one is chosen in Settings, and can switch in the middle of a game; `wwd --lang de` or `wwd --lang ja` picks one at the terminal. German and Japanese text load when that language is chosen, and the installed app keeps them for offline play; the Japanese fonts are downloaded only when Japanese is chosen.

## Status

Milestones M1 to M4 are complete: the rules engine, the local loop, online play, and the finished app, with its screens, settings, pausing and saved games, rematches, history with replays and stats, backups, and installing as an app that opens offline. M5 has added German and Japanese; it goes on with a rewritten rulebook and a tutorial, the deferred gameplay settings and a full accessibility audit.

## Repository layout

```
engine/   Rust workspace: wwd-core (rules), wwd-cli (the wwd tool), wwd-wasm (WebAssembly bindings)
app/      TypeScript pnpm workspace: protocol, transport, referee core and adapters, client core, web app
docs/     design spec, milestone plans, research, mockups, deployment guide
scripts/  the deployment smoke test
```

## Building and testing

You need:

- Rust through `rustup`, which installs the pinned toolchain and the `wasm32-unknown-unknown` target on first use;
- Node 24 and pnpm 10;
- `wasm-bindgen-cli` 0.2.129: `cargo install wasm-bindgen-cli --version 0.2.129 --locked`.

Engine, from `engine/`:

```sh
cargo test --workspace --all-features
```

App, from `app/`:

```sh
pnpm install
pnpm build
pnpm test
pnpm --filter @wwd/web dev
```

The dev server plays a two-tab game against an in-browser referee. For browser tests, run `pnpm --filter @wwd/web exec playwright install chromium` once, then `pnpm --filter @wwd/web e2e`, `e2e:online` or `e2e:parity`.

## Documents

- [Design spec](docs/superpowers/specs/2026-11-22-werewolf-duel-online-design.md): architecture, protocol and the rules specification.
- [Deployment guide](docs/deploy.md): GitHub Pages, Cloudflare Workers and self-hosting.
- [Mockups](docs/mockups/mockups.html): low-fidelity screen designs (open in a browser).
- [Card and plan-screen mockups](docs/mockups/cards-and-plan.html): sections H and I are binding for the cards and the plan screen.
- [Cards, plan screen and Home design note](docs/superpowers/specs/2026-11-24-cards-plan-home-design.md): the card anatomy, the plan screen and Home.
- [Layout pass plan](docs/superpowers/plans/2026-11-23-layout-pass.md): the implementation plan for the layout pass.
- [Research and recommendations](docs/research/2026-11-21-research-and-recommendations.md): background and alternatives considered.

## Licence

The code and documentation in this repository are licensed under either of

- the [MIT licence](LICENSE-MIT), or
- the [Apache License, Version 2.0](LICENSE-APACHE),

at your option. Copyright © 2026 David F Dev.

The licence covers this project's own work only. Werewolf: Duel! and its characters belong to their respective owners.

The Japanese font subsets in [`app/apps/web/src/theme/ja-fonts/`](app/apps/web/src/theme/ja-fonts/) (BIZ UDPGothic and Shippori Mincho B1) are licensed under the SIL Open Font License 1.1; their copyright notices and the licence are in [`OFL.txt`](app/apps/web/src/theme/ja-fonts/OFL.txt) beside them.

Unless you explicitly state otherwise, any contribution you intentionally submit for inclusion in this project, as defined in the Apache-2.0 licence, is dual-licensed as above, with no additional terms or conditions.
