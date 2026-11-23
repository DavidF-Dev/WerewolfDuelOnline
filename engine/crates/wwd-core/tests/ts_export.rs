#![cfg(feature = "ts")]

use std::fs;
use std::path::PathBuf;

use ts_rs::{Config, TS};
use wwd_core::{
    Command, Event, Pending, Replay, RoundBoundary, RuleError, RulesConfig, TimelineStep, View,
    Viewer,
};

fn export_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("wwd-ts-export-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn export_everything(dir: &std::path::Path) {
    let cfg = Config::new().with_out_dir(dir);
    View::export_all(&cfg).unwrap();
    Event::export_all(&cfg).unwrap();
    Command::export_all(&cfg).unwrap();
    Pending::export_all(&cfg).unwrap();
    Replay::export_all(&cfg).unwrap();
    RoundBoundary::export_all(&cfg).unwrap();
    RulesConfig::export_all(&cfg).unwrap();
    RuleError::export_all(&cfg).unwrap();
    Viewer::export_all(&cfg).unwrap();
    TimelineStep::export_all(&cfg).unwrap();
}

#[test]
fn exports_all_public_types() {
    let dir = export_dir("all");
    export_everything(&dir);
    for name in [
        "View",
        "Event",
        "EventKind",
        "Command",
        "Pending",
        "Replay",
        "RulesConfig",
        "Seat",
        "Character",
        "TargetCard",
        "Phase",
        "RoundBoundary",
        "Viewer",
        "TimelineStep",
        "Plan",
    ] {
        let text = fs::read_to_string(dir.join(format!("{name}.ts")))
            .unwrap_or_else(|_| panic!("{name}.ts missing"));
        assert!(!text.is_empty(), "{name}.ts is empty");
    }
}

#[test]
fn hex_fields_are_strings() {
    let dir = export_dir("hex");
    export_everything(&dir);
    let segment = fs::read_to_string(dir.join("Segment.ts")).unwrap();
    assert!(segment.contains("seed: string"), "{segment}");
    let kind = fs::read_to_string(dir.join("EventKind.ts")).unwrap();
    assert!(kind.contains("seed_commitment: string"), "{kind}");
}

#[test]
fn shapes_match_serde() {
    let dir = export_dir("shapes");
    export_everything(&dir);
    let seat = fs::read_to_string(dir.join("Seat.ts")).unwrap();
    assert!(seat.contains("\"p0\" | \"p1\""), "{seat}");
    let min = fs::read_to_string(dir.join("MinTargets.ts")).unwrap();
    assert!(min.contains("0 | 1"), "{min}");
    let character = fs::read_to_string(dir.join("Character.ts")).unwrap();
    assert!(character.contains("\"wolf_king\""), "{character}");
    let kind = fs::read_to_string(dir.join("EventKind.ts")).unwrap();
    assert!(kind.contains("\"round_started\""), "{kind}");
}
