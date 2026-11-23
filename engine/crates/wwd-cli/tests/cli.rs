use std::fs;
use std::path::Path;

use assert_cmd::Command as Wwd;
use predicates::prelude::*;
use serde_json::Value;
use tempfile::TempDir;
use wwd_core::{
    BadgeStart, EventKind, RulesConfig, Seat, apply, legal_actions, new_game, pending, random_game,
};

const SEED_HEX: &str = "0101010101010101010101010101010101010101010101010101010101010101";

fn wwd() -> Wwd {
    Wwd::cargo_bin("wwd").expect("the wwd binary is built")
}

fn config() -> RulesConfig {
    RulesConfig {
        badge_start: BadgeStart::Seat(Seat::P0),
        ..RulesConfig::default()
    }
}

/// The first legal action at every step until the first round ends, as script lines.
fn one_round_script() -> String {
    let mut state = new_game([1; 32], config());
    let mut lines = Vec::new();
    loop {
        let seat = pending(&state).seats[0];
        let cmd = legal_actions(&state, seat)[0].clone();
        lines.push(serde_json::json!({ "seat": seat, "cmd": cmd }).to_string());
        let events = apply(&mut state, seat, cmd).expect("legal actions apply");
        if events.iter().any(|e| {
            matches!(
                e.kind,
                EventKind::RoundEnded { .. } | EventKind::GameOver { .. }
            )
        }) {
            return lines.join("\n");
        }
    }
}

fn write(dir: &TempDir, name: &str, text: &str) -> std::path::PathBuf {
    let path = dir.path().join(name);
    fs::write(&path, text).unwrap();
    path
}

fn json_file(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).unwrap()).unwrap()
}

#[test]
fn verify_ok() {
    let dir = TempDir::new().unwrap();
    let (replay, _) = random_game([3; 32], RulesConfig::default(), [4; 32]);
    let file = write(&dir, "game.json", &serde_json::to_string(&replay).unwrap());
    wwd()
        .arg("verify")
        .arg(&file)
        .assert()
        .success()
        .stdout(predicate::str::is_match("^ok [0-9a-f]{64}\n$").unwrap());
}

#[test]
fn verify_failure_exits_1() {
    let dir = TempDir::new().unwrap();
    let (mut replay, _) = random_game([3; 32], RulesConfig::default(), [4; 32]);
    replay.segments[0].checkpoints[0].hash = [0; 32];
    let file = write(&dir, "game.json", &serde_json::to_string(&replay).unwrap());
    wwd()
        .arg("verify")
        .arg(&file)
        .assert()
        .code(1)
        .stderr(predicate::str::contains("error-replay-checkpoint-mismatch"));
}

#[test]
fn script_json_runs() {
    let dir = TempDir::new().unwrap();
    let script = write(&dir, "moves.jsonl", &one_round_script());
    let output = wwd()
        .args([
            "play", "--json", "--badge", "p0", "--seed", SEED_HEX, "--script",
        ])
        .arg(&script)
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), one_round_script().lines().count());
    for line in lines {
        let view: Value = serde_json::from_str(line).expect("each line is JSON");
        assert_eq!(view["viewer"], "omniscient");
    }
}

#[test]
fn script_rule_error_exit_1() {
    let dir = TempDir::new().unwrap();
    let script = write(
        &dir,
        "bad.jsonl",
        r#"{"seat":"p0","cmd":{"place_hourglasses":{"n":0}}}"#,
    );
    wwd()
        .args(["play", "--json", "--seed", SEED_HEX, "--script"])
        .arg(&script)
        .assert()
        .code(1)
        .stderr(predicate::str::contains("error-wrong-phase"));
}

#[test]
fn script_saves_a_verifiable_replay() {
    let dir = TempDir::new().unwrap();
    let script = write(&dir, "moves.jsonl", &one_round_script());
    let saved = dir.path().join("saved.json");
    wwd()
        .args(["play", "--badge", "p0", "--seed", SEED_HEX, "--script"])
        .arg(&script)
        .arg("--save")
        .arg(&saved)
        .assert()
        .success();
    wwd().arg("verify").arg(&saved).assert().success();
    wwd()
        .arg("replay")
        .arg(&saved)
        .args(["--as", "p0"])
        .assert()
        .success()
        .stdout(predicate::str::contains("Round 1 begins"));
}

#[test]
fn edit_requires_unsafe() {
    let dir = TempDir::new().unwrap();
    let state = dir.path().join("s.json");
    wwd()
        .arg("--unsafe")
        .arg("new-state")
        .arg(&state)
        .args(["--seed", SEED_HEX])
        .assert()
        .success();
    wwd()
        .arg("edit")
        .arg(&state)
        .arg("set p1.health 1")
        .assert()
        .code(2)
        .stderr(predicate::str::contains("error-unsafe-required"));
    assert_eq!(json_file(&state)["tainted"], false);
}

#[test]
fn edit_sets_health() {
    let dir = TempDir::new().unwrap();
    let state = dir.path().join("s.json");
    wwd()
        .arg("--unsafe")
        .arg("new-state")
        .arg(&state)
        .args(["--seed", SEED_HEX])
        .assert()
        .success();
    wwd()
        .arg("--unsafe")
        .arg("edit")
        .arg(&state)
        .arg("set p1.health 1")
        .assert()
        .success();
    let edited = json_file(&state);
    assert_eq!(edited["players"][1]["health"], 1);
    assert_eq!(edited["tainted"], true);
}

#[test]
fn edit_failure_and_bad_expression() {
    let dir = TempDir::new().unwrap();
    let state = dir.path().join("s.json");
    wwd()
        .arg("--unsafe")
        .arg("new-state")
        .arg(&state)
        .assert()
        .success();
    wwd()
        .arg("--unsafe")
        .arg("edit")
        .arg(&state)
        .arg("set p0.hourglass 9")
        .assert()
        .code(1)
        .stderr(predicate::str::contains("error-edit-supply-exceeded"));
    wwd()
        .arg("--unsafe")
        .arg("edit")
        .arg(&state)
        .arg("set p0.mana 1")
        .assert()
        .code(2)
        .stderr(predicate::str::contains("error-edit-unknown-field"));
}

#[test]
fn fuzz_reports_games() {
    wwd()
        .args(["fuzz", "--games", "5", "--seed", SEED_HEX])
        .assert()
        .success()
        .stdout(predicate::str::contains("Played 5 games"));
    let output = wwd()
        .args(["fuzz", "--games", "3", "--seed", SEED_HEX, "--json"])
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let report: Value = serde_json::from_slice(&output).unwrap();
    assert_eq!(report["games"], 3);
}

#[test]
fn bad_seed_is_a_usage_error() {
    wwd()
        .args(["fuzz", "--games", "1", "--seed", "xyz"])
        .assert()
        .code(2);
}

#[test]
fn interactive_play_hides_the_other_hand() {
    let dir = TempDir::new().unwrap();
    let saved = dir.path().join("saved.json");
    // Enter, then quit at the first prompt.
    let output = wwd()
        .args(["play", "--badge", "p0", "--seed", SEED_HEX, "--save"])
        .arg(&saved)
        .write_stdin("\nq\n")
        .assert()
        .success()
        .stdout(predicate::str::contains("Pass to Player 1 — press Enter"))
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    assert_eq!(text.matches("Your hand:").count(), 1);
    assert!(
        !text.contains(SEED_HEX),
        "the seed stays hidden during play"
    );
    wwd().arg("verify").arg(&saved).assert().success();
}

#[test]
fn interactive_play_asks_each_seat_to_start_the_next_round() {
    let output = wwd()
        .args(["play", "--badge", "p0", "--seed", SEED_HEX])
        .write_stdin("1\n".repeat(40))
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let text = String::from_utf8(output).unwrap();
    let ended = text.find("Round 1 ends").expect("round 1 ends");
    let started = text.find("Round 2 begins").expect("round 2 is dealt");
    let between = &text[ended..started];
    assert_eq!(between.matches("1) Next round").count(), 2, "{between}");
    assert!(between.contains("Player 1 is ready for the next round"));
}

#[test]
fn verify_reports_a_tainted_replay_but_succeeds() {
    use wwd_core::{Edit, Recorder};

    let dir = TempDir::new().unwrap();
    let mut recorder = Recorder::new([3; 32], config());
    recorder
        .apply_edit(Edit::SetHealth {
            seat: Seat::P0,
            n: 1,
        })
        .unwrap();
    let file = write(
        &dir,
        "tainted.json",
        &serde_json::to_string(recorder.replay()).unwrap(),
    );
    wwd()
        .arg("verify")
        .arg(&file)
        .assert()
        .success()
        .stdout(predicate::str::is_match("^ok [0-9a-f]{64}\n$").unwrap())
        .stderr(predicate::str::contains("this replay is tainted"));

    let untainted = write(
        &dir,
        "fair.json",
        &serde_json::to_string(Recorder::new([3; 32], config()).replay()).unwrap(),
    );
    wwd()
        .arg("verify")
        .arg(&untainted)
        .assert()
        .success()
        .stderr(predicate::str::is_empty());
}

#[test]
fn verify_rejects_a_game_ending_edit_without_panicking() {
    let dir = TempDir::new().unwrap();
    let (mut replay, _) = random_game([3; 32], RulesConfig::default(), [4; 32]);
    replay.tainted = true;
    replay.segments[0].entries.insert(
        0,
        wwd_core::ReplayEntry::Edit(wwd_core::Edit::SetFang {
            seat: Seat::P0,
            n: 3,
        }),
    );
    let file = write(
        &dir,
        "crafted.json",
        &serde_json::to_string(&replay).unwrap(),
    );
    wwd()
        .arg("verify")
        .arg(&file)
        .assert()
        .code(1)
        .stderr(predicate::str::contains("error-replay-edit"))
        .stderr(predicate::str::contains("panicked").not());
}

#[test]
fn replay_step_stops_entirely_at_end_of_input() {
    use wwd_core::{Command, Phase, Recorder};

    let mut recorder = Recorder::new([1; 32], config());
    while recorder.state().phase != Phase::RoundOver {
        let seat = pending(recorder.state()).seats[0];
        let cmd = legal_actions(recorder.state(), seat)[0].clone();
        recorder.apply(seat, cmd).unwrap();
    }
    let boundary = recorder.round_boundary().unwrap();
    let mut resumed = Recorder::resume(boundary, recorder.replay().clone(), [2; 32]).unwrap();
    resumed.apply(Seat::P0, Command::NextRound).unwrap();
    let dir = TempDir::new().unwrap();
    let file = write(
        &dir,
        "two.json",
        &serde_json::to_string(resumed.replay()).unwrap(),
    );

    let all = wwd().arg("replay").arg(&file).assert().success();
    let all = String::from_utf8(all.get_output().stdout.clone()).unwrap();
    assert!(all.contains("Start of segment 1"));

    let stepped = wwd()
        .arg("replay")
        .arg(&file)
        .arg("--step")
        .write_stdin("")
        .assert()
        .success();
    let stepped = String::from_utf8(stepped.get_output().stdout.clone()).unwrap();
    assert!(stepped.contains("Start of segment 0"));
    assert!(!stepped.contains("Start of segment 1"), "{stepped}");
    assert_eq!(stepped.matches("Press Enter").count(), 1);
}

#[test]
fn replay_announces_a_resumed_segment_from_every_perspective() {
    use wwd_core::{Command, Phase, Recorder};

    let mut recorder = Recorder::new([1; 32], config());
    while recorder.state().phase != Phase::RoundOver {
        let seat = pending(recorder.state()).seats[0];
        let cmd = legal_actions(recorder.state(), seat)[0].clone();
        recorder.apply(seat, cmd).unwrap();
    }
    let boundary = recorder.round_boundary().unwrap();
    let mut resumed = Recorder::resume(boundary, recorder.replay().clone(), [2; 32]).unwrap();
    resumed.apply(Seat::P0, Command::NextRound).unwrap();
    let dir = TempDir::new().unwrap();
    let file = write(
        &dir,
        "resumed.json",
        &serde_json::to_string(resumed.replay()).unwrap(),
    );

    for viewer in ["p0", "p1", "all"] {
        let out = wwd()
            .arg("replay")
            .arg(&file)
            .args(["--as", viewer])
            .assert()
            .success();
        let out = String::from_utf8(out.get_output().stdout.clone()).unwrap();
        assert!(
            out.contains("Start of segment 1\n  The game resumes in round 2.\n"),
            "{viewer}: {out}"
        );
    }
}
