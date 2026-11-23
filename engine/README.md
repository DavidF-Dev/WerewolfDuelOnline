# Werewolf: Duel! engine

A deterministic Rust rules engine for Werewolf: Duel!, the two-player card game, written for Werewolf: Duel! Online. It is usable standalone: the `wwd-core` library has no dependency on the rest of the project, and the `wwd` command-line tool drives it directly. This is an unofficial fan project and is not affiliated with or endorsed by the publisher or designers of Werewolf: Duel!.

Licensed under either of MIT or Apache-2.0, at your option.

## Command-line tool

The `wwd` binary drives the engine. Run it from this directory with `cargo run -p wwd-cli -- <command>`.

- `wwd play` plays a hot-seat game at the terminal. Options include `--seed`, `--badge`, `--min-targets`, `--tiebreak` and `--save <file>` to write a replay. `--script <file>` runs commands from a JSON-lines file instead of prompting. After each Showdown the game waits in Round over, and each player is asked to continue before the next round is dealt.
- `wwd replay <file>` prints a saved game, optionally one step at a time with `--step`, or from one seat's view with `--as p0` or `--as p1`.
- `wwd verify <file>` re-simulates a replay and checks its hashes and checkpoints. It exits with 1 on failure. A valid replay that contains edits still passes, with a notice that it is tainted.
- `wwd fuzz --games <n>` plays random games and checks the engine's invariants.
- `wwd --unsafe edit <state> "set p1.health 1"` edits a saved state directly, bypassing the rules. The state is marked as tainted, and `--unsafe` is required. An edit may not end the game, so health must stay above 0, Crosses below 4 and Fangs below 3.

## Feature flags

`wwd-core` has two optional features, and builds for `wasm32-unknown-unknown` without either:

- `unsafe-edit` exposes `apply_edit`, which sets health, markers, hands, the Badge or the Potion directly. Every edit sets `State.tainted`, and edits are recorded in replays. Without the feature, replays containing edits are rejected.
- `fuzz` exposes the random self-play and invariant checks (`random_game`, `fuzz`, `check_invariants`).

The CLI enables both.

## Rules traceability

[docs/rules-coverage.md](docs/rules-coverage.md) maps every rule to the tests that prove it.

## Testing

- `cargo test --workspace --all-features` runs every test.
- `cargo test -p wwd-core` tests the library without optional features.
- `cargo build -p wwd-core --target wasm32-unknown-unknown` checks the WebAssembly build (after `rustup target add wasm32-unknown-unknown`).
