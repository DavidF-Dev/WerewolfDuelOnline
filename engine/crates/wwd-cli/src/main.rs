//! `wwd`: a command-line driver for the Werewolf: Duel! engine.

mod edit_parse;
mod interactive;
mod render;

use std::fs;
use std::io::{self, BufRead};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Deserialize;
use wwd_core::{
    BadgeStart, Command, Event, MinTargets, Recorder, Replay, ReplayEntry, RulesConfig, Seat,
    State, Tiebreak, Viewer, apply_edit, fuzz, hash, new_game, replay, view, visible_to,
};

use render::{Locale, args, hex};

const EXIT_FAILURE: u8 = 1;
const EXIT_USAGE: u8 = 2;

/// An error ready to print, with the process exit code it maps to.
struct Failure {
    code: u8,
    message: String,
}

type Outcome = Result<(), Failure>;

fn failure(code: u8, message: String) -> Failure {
    Failure { code, message }
}

#[derive(Parser)]
#[command(name = "wwd", version, about = "Werewolf: Duel! rules engine driver")]
struct Cli {
    /// Confirms that a command may bypass the rules.
    #[arg(long = "unsafe", global = true)]
    unsafe_mode: bool,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Plays a game: hot-seat at the terminal, or scripted from a file.
    Play(PlayArgs),
    /// Prints the events of a saved game, step by step.
    Replay(ReplayArgs),
    /// Re-simulates a saved game and checks its checkpoints.
    Verify { file: PathBuf },
    /// Plays random games, checking the engine's invariants.
    Fuzz(FuzzArgs),
    /// Edits a saved state directly, bypassing the rules (needs --unsafe).
    Edit {
        state: PathBuf,
        #[arg(required = true, allow_hyphen_values = true)]
        exprs: Vec<String>,
    },
    /// Writes a fresh game state to a file (needs --unsafe).
    #[command(hide = true)]
    NewState {
        file: PathBuf,
        #[arg(long)]
        seed: Option<Seed>,
    },
}

#[derive(Args)]
struct PlayArgs {
    #[arg(long)]
    seed: Option<Seed>,
    #[arg(long, value_enum, default_value_t = BadgeArg::Random)]
    badge: BadgeArg,
    #[arg(long, default_value_t = 1, value_parser = clap::value_parser!(u8).range(0..=1))]
    min_targets: u8,
    #[arg(long, value_enum, default_value_t = TiebreakArg::Current)]
    tiebreak: TiebreakArg,
    /// Writes the replay here when the game ends or a player quits.
    #[arg(long)]
    save: Option<PathBuf>,
    /// Runs the commands in this JSON-lines file instead of prompting.
    #[arg(long)]
    script: Option<PathBuf>,
    /// Prints one omniscient JSON view per scripted command.
    #[arg(long, requires = "script")]
    json: bool,
}

#[derive(Args)]
struct ReplayArgs {
    file: PathBuf,
    /// Waits for Enter between steps.
    #[arg(long)]
    step: bool,
    #[arg(long = "as", value_enum, default_value_t = AsArg::All)]
    viewer: AsArg,
}

#[derive(Args)]
struct FuzzArgs {
    #[arg(long)]
    games: u32,
    #[arg(long)]
    seed: Option<Seed>,
    #[arg(long)]
    json: bool,
}

#[derive(Clone, Copy, ValueEnum)]
enum BadgeArg {
    Random,
    P0,
    P1,
}

#[derive(Clone, Copy, ValueEnum)]
enum TiebreakArg {
    Current,
    BadgeOnly,
}

#[derive(Clone, Copy, ValueEnum)]
enum AsArg {
    P0,
    P1,
    All,
}

/// A 32-byte seed given as 64 hexadecimal characters.
#[derive(Clone, Copy)]
struct Seed([u8; 32]);

impl std::str::FromStr for Seed {
    type Err = String;

    fn from_str(text: &str) -> Result<Self, String> {
        if text.len() != 64 || !text.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err("expected 64 hexadecimal characters".to_string());
        }
        let mut bytes = [0u8; 32];
        for (byte, pair) in bytes.iter_mut().zip(text.as_bytes().chunks(2)) {
            let pair = std::str::from_utf8(pair).map_err(|e| e.to_string())?;
            *byte = u8::from_str_radix(pair, 16)
                .map_err(|_| "expected 64 hexadecimal characters".to_string())?;
        }
        Ok(Seed(bytes))
    }
}

/// The seed given, or fresh operating-system randomness.
fn seed_or_random(seed: Option<Seed>) -> [u8; 32] {
    seed.map_or_else(
        || {
            let mut bytes = [0u8; 32];
            getrandom::fill(&mut bytes).expect("the operating system provides randomness");
            bytes
        },
        |Seed(bytes)| bytes,
    )
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let loc = Locale::new();
    match run(&loc, cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(Failure { code, message }) => {
            eprintln!("{message}");
            ExitCode::from(code)
        }
    }
}

fn run(loc: &Locale, cli: Cli) -> Outcome {
    match cli.command {
        Commands::Play(play_args) => play(loc, &play_args),
        Commands::Replay(replay_args) => run_replay(loc, &replay_args),
        Commands::Verify { file } => run_verify(loc, &file),
        Commands::Fuzz(fuzz_args) => run_fuzz(loc, &fuzz_args),
        Commands::Edit { state, exprs } => {
            require_unsafe(loc, cli.unsafe_mode)?;
            run_edit(loc, &state, &exprs)
        }
        Commands::NewState { file, seed } => {
            require_unsafe(loc, cli.unsafe_mode)?;
            let state = new_game(seed_or_random(seed), RulesConfig::default());
            write_json(loc, &file, &state, true)?;
            println!(
                "{}",
                loc.text("cli-state-written", &args!("path" => path_text(&file)))
            );
            Ok(())
        }
    }
}

fn require_unsafe(loc: &Locale, allowed: bool) -> Outcome {
    if allowed {
        Ok(())
    } else {
        Err(failure(
            EXIT_USAGE,
            loc.error("error-unsafe-required", &args!()),
        ))
    }
}

fn path_text(path: &Path) -> String {
    path.display().to_string()
}

fn read_text(loc: &Locale, path: &Path) -> Result<String, Failure> {
    fs::read_to_string(path).map_err(|_| {
        failure(
            EXIT_USAGE,
            loc.error("error-read-failed", &args!("detail" => path_text(path))),
        )
    })
}

fn read_json<T: for<'de> Deserialize<'de>>(loc: &Locale, path: &Path) -> Result<T, Failure> {
    let text = read_text(loc, path)?;
    serde_json::from_str(&text).map_err(|_| {
        failure(
            EXIT_USAGE,
            loc.error("error-parse-failed", &args!("detail" => path_text(path))),
        )
    })
}

fn write_json<T: serde::Serialize>(loc: &Locale, path: &Path, value: &T, pretty: bool) -> Outcome {
    let text = if pretty {
        serde_json::to_string_pretty(value)
    } else {
        serde_json::to_string(value)
    }
    .expect("engine types serialise to JSON");
    fs::write(path, text).map_err(|_| {
        failure(
            EXIT_USAGE,
            loc.error("error-write-failed", &args!("detail" => path_text(path))),
        )
    })
}

fn rules_config(args: &PlayArgs) -> RulesConfig {
    RulesConfig {
        tiebreak: match args.tiebreak {
            TiebreakArg::Current => Tiebreak::HourglassesThenBadge,
            TiebreakArg::BadgeOnly => Tiebreak::BadgeOnly,
        },
        min_targets: MinTargets::try_from(args.min_targets)
            .expect("the parser accepts only 0 or 1"),
        badge_start: match args.badge {
            BadgeArg::Random => BadgeStart::Random,
            BadgeArg::P0 => BadgeStart::Seat(Seat::P0),
            BadgeArg::P1 => BadgeStart::Seat(Seat::P1),
        },
    }
}

fn play(loc: &Locale, play_args: &PlayArgs) -> Outcome {
    let seed = seed_or_random(play_args.seed);
    let config = rules_config(play_args);
    let replay = if let Some(script) = &play_args.script {
        // Standard output carries only the game when --json is given.
        eprintln!("{}", loc.text("cli-seed", &args!("seed" => hex(&seed))));
        run_script(loc, script, seed, config, play_args.json)?
    } else {
        interactive::play(loc, seed, config).replay
    };
    if let Some(path) = &play_args.save {
        write_json(loc, path, &replay, false)?;
        println!(
            "{}",
            loc.text("cli-saved", &args!("path" => path_text(path)))
        );
    }
    Ok(())
}

#[derive(Deserialize)]
struct ScriptLine {
    seat: Seat,
    cmd: Command,
}

fn run_script(
    loc: &Locale,
    script: &Path,
    seed: [u8; 32],
    config: RulesConfig,
    json: bool,
) -> Result<Replay, Failure> {
    let text = read_text(loc, script)?;
    let mut recorder = Recorder::new(seed, config);
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() {
            continue;
        }
        let parsed: ScriptLine = serde_json::from_str(line).map_err(|err| {
            failure(
                EXIT_USAGE,
                loc.error(
                    "error-script-line",
                    &args!("line" => index as u32 + 1, "detail" => err.to_string()),
                ),
            )
        })?;
        let events = recorder
            .apply(parsed.seat, parsed.cmd)
            .map_err(|err| failure(EXIT_FAILURE, loc.rule_error(err)))?;
        if json {
            let omniscient = view(recorder.state(), Viewer::Omniscient);
            println!(
                "{}",
                serde_json::to_string(&omniscient).expect("views serialise to JSON")
            );
        } else {
            for event in &events {
                println!("{}", loc.event(&event.kind));
            }
        }
    }
    Ok(recorder.replay().clone())
}

fn run_verify(loc: &Locale, file: &Path) -> Outcome {
    let saved: Replay = read_json(loc, file)?;
    let recorder = Recorder::from_replay(saved)
        .map_err(|err| failure(EXIT_FAILURE, loc.replay_error(&err)))?;
    let state = recorder.state();
    if recorder.replay().tainted || state.tainted {
        // Standard output keeps only the result line, so the notice goes to standard error.
        eprintln!("{}", loc.plain("cli-verify-tainted"));
    }
    println!(
        "{}",
        loc.text("cli-verify-ok", &args!("hash" => hex(&hash(state))))
    );
    Ok(())
}

fn run_replay(loc: &Locale, replay_args: &ReplayArgs) -> Outcome {
    let saved: Replay = read_json(loc, &replay_args.file)?;
    let to_failure = |err| failure(EXIT_FAILURE, loc.replay_error(&err));
    replay(&saved).map_err(to_failure)?;

    let viewer = match replay_args.viewer {
        AsArg::P0 => Viewer::Seat(Seat::P0),
        AsArg::P1 => Viewer::Seat(Seat::P1),
        AsArg::All => Viewer::Omniscient,
    };
    let mut input = io::stdin().lock().lines();
    let mut step = 0u32;
    let mut logged = 0usize;
    for (segment_index, segment) in saved.segments.iter().enumerate() {
        for applied in 0..=segment.entries.len() {
            // Each step is a prefix of the replay; the log grows by that step's events.
            let mut prefix = saved.clone();
            prefix.segments.truncate(segment_index + 1);
            let last = &mut prefix.segments[segment_index];
            last.entries.truncate(applied);
            last.checkpoints.clear();
            let state = replay(&prefix).map_err(to_failure)?;

            if applied == 0 {
                println!(
                    "{}",
                    loc.text("cli-step-start", &args!("segment" => segment_index as u64))
                );
                logged = 0;
            } else {
                step += 1;
                println!(
                    "{}",
                    step_header(loc, viewer, step, &segment.entries[applied - 1])
                );
            }
            print_events(loc, &state.log[logged..], viewer);
            logged = state.log.len();

            if replay_args.step && applied < segment.entries.len() {
                println!("{}", loc.plain("cli-step-continue"));
                if input.next().is_none() {
                    return Ok(());
                }
            }
        }
    }
    Ok(())
}

fn step_header(loc: &Locale, viewer: Viewer, step: u32, entry: &ReplayEntry) -> String {
    match entry {
        ReplayEntry::Command { seat, cmd } => {
            let may_see = matches!(viewer, Viewer::Omniscient) || viewer == Viewer::Seat(*seat);
            if may_see {
                loc.text(
                    "cli-step-command",
                    &args!("step" => step, "seat" => loc.seat(*seat), "command" => loc.command(cmd)),
                )
            } else {
                loc.text(
                    "cli-step-header",
                    &args!("step" => step, "seat" => loc.seat(*seat)),
                )
            }
        }
        ReplayEntry::Edit(_) => loc.text("cli-step-edit", &args!("step" => step)),
    }
}

fn print_events(loc: &Locale, events: &[Event], viewer: Viewer) {
    for event in events.iter().filter(|e| visible_to(e, viewer)) {
        println!("  {}", loc.event(&event.kind));
    }
}

fn run_fuzz(loc: &Locale, fuzz_args: &FuzzArgs) -> Outcome {
    let seed = seed_or_random(fuzz_args.seed);
    let report = fuzz(fuzz_args.games, seed).map_err(|detail| {
        failure(
            EXIT_FAILURE,
            loc.error("error-fuzz-failed", &args!("detail" => detail)),
        )
    })?;
    if fuzz_args.json {
        let json = serde_json::json!({
            "seed": hex(&seed),
            "games": report.games,
            "rounds": report.rounds,
            "wins": report.wins,
            "by_reason": report.by_reason,
        });
        println!("{json}");
    } else {
        println!("{}", loc.text("cli-seed", &args!("seed" => hex(&seed))));
        println!(
            "{}",
            loc.text(
                "cli-fuzz-summary",
                &args!(
                    "games" => report.games,
                    "rounds" => report.rounds,
                    "wins0" => report.wins[0],
                    "wins1" => report.wins[1],
                ),
            )
        );
        for (reason, games) in &report.by_reason {
            println!(
                "{}",
                loc.text(
                    "cli-fuzz-reason",
                    &args!("reason" => reason.clone(), "games" => *games),
                )
            );
        }
    }
    Ok(())
}

fn run_edit(loc: &Locale, path: &Path, exprs: &[String]) -> Outcome {
    let edits = edit_parse::parse_edits(exprs).map_err(|err| {
        failure(
            EXIT_USAGE,
            loc.error(err.kind.id(), &args!("detail" => err.detail)),
        )
    })?;
    let mut state: State = read_json(loc, path)?;
    let count = edits.len() as u32;
    for edit in edits {
        apply_edit(&mut state, edit).map_err(|err| failure(EXIT_FAILURE, loc.edit_error(err)))?;
    }
    write_json(loc, path, &state, true)?;
    println!("{}", loc.text("cli-edit-applied", &args!("count" => count)));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Seed;

    #[test]
    fn seed_requires_64_hex_digits() {
        assert!("ab".repeat(32).parse::<Seed>().is_ok());
        assert!("AB".repeat(32).parse::<Seed>().is_ok());
        assert!(format!("+{}", "a".repeat(63)).parse::<Seed>().is_err());
        assert!(format!("+a{}", "bc".repeat(31)).parse::<Seed>().is_err());
        assert!("ab".repeat(31).parse::<Seed>().is_err());
        assert!("zz".repeat(32).parse::<Seed>().is_err());
    }
}
