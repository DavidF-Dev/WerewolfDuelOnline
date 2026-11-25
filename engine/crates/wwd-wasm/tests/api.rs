use wwd_core::{Command, EventKind, RulesConfig, Seat, Viewer};
use wwd_wasm::api::{self, Game};

const SEED: &str = "0101010101010101010101010101010101010101010101010101010101010101";

fn game() -> Game {
    Game::create(SEED, RulesConfig::default()).unwrap()
}

#[test]
fn create_apply_view_roundtrip() {
    let mut game = game();
    let legal = game.legal_actions(Seat::P0);
    assert!(!legal.is_empty());
    let events = game.apply(Seat::P0, legal[0].clone()).unwrap();
    assert!(!events.is_empty());
    let view = game.view(Viewer::Seat(Seat::P1));
    assert!(view.players[0].hand.is_none());
    let since = game.events_since(0, Viewer::Seat(Seat::P1));
    assert!(!since.is_empty());
    assert!(
        !since
            .iter()
            .any(|(_, event)| matches!(&event.kind, EventKind::HandDealt { seat: Seat::P0, .. }))
    );
    assert_eq!(
        game.log_length() as usize,
        game.events_since(0, Viewer::Omniscient).len()
    );
}

#[test]
fn errors_carry_engine_ids() {
    let mut game = game();
    let err = game.apply(Seat::P0, Command::NextRound).unwrap_err();
    assert_eq!(err.id, "error-wrong-phase");
    for bad in ["zz", "", &SEED[..63], &format!("{SEED}0")] {
        let err = Game::create(bad, RulesConfig::default()).err().unwrap();
        assert_eq!(err.id, "error-invalid-input", "{bad}");
    }
    let non_ascii = "é".repeat(32);
    assert_eq!(
        Game::create(&non_ascii, RulesConfig::default())
            .err()
            .unwrap()
            .id,
        "error-invalid-input"
    );
}

#[test]
fn seed_hex_accepts_either_case() {
    let upper = "AB".repeat(32);
    let lower = "ab".repeat(32);
    assert_eq!(
        api::seed_commitment(&upper).unwrap(),
        api::seed_commitment(&lower).unwrap()
    );
    assert_eq!(api::seed_commitment(&lower).unwrap().len(), 64);
}

#[test]
fn from_replay_verifies() {
    let mut game = game();
    let first = game.legal_actions(Seat::P0)[0].clone();
    game.apply(Seat::P0, first).unwrap();
    let replay = game.replay();
    assert!(Game::from_replay(replay.clone()).is_ok());
    assert!(api::verify_replay(&replay).is_ok());

    let mut tampered = replay;
    tampered.segments[0].seed = [9; 32];
    let err = Game::from_replay(tampered).err().unwrap();
    assert!(err.id.starts_with("error-replay-"), "{}", err.id);
}

#[test]
fn hex_fields_serialise_as_strings() {
    use serde::Serializer as _;
    // The bindings' serialiser is human-readable, which selects the hex form.
    assert!((&serde_wasm_bindgen::Serializer::json_compatible()).is_human_readable());
    let json = serde_json::to_value(game().replay()).unwrap();
    let seed = &json["segments"][0]["seed"];
    assert_eq!(seed.as_str().map(str::len), Some(64), "{seed}");
}

#[test]
fn event_id_and_visibility() {
    let game = game();
    let events = game.events_since(0, Viewer::Omniscient);
    let started = &events[0].1;
    assert_eq!(api::event_id(&started.kind), "event-game-started");
    assert!(api::visible_to(started, Viewer::Spectator));
}

#[test]
fn can_resign_until_game_over() {
    let mut game = game();
    assert!(game.can_resign(Seat::P0));
    assert!(game.can_resign(Seat::P1));
    assert!(!game.legal_actions(Seat::P0).contains(&Command::Resign));
    game.apply(Seat::P1, Command::Resign).unwrap();
    assert!(!game.can_resign(Seat::P0));
    assert!(!game.can_resign(Seat::P1));
    let err = game.apply(Seat::P0, Command::Resign).unwrap_err();
    assert_eq!(err.id, "error-game-over");
}

#[test]
fn validate_plan_returns_error_ids() {
    use wwd_core::{Character, Plan, TargetCard};

    let config = RulesConfig::default();
    let plan = |character, targets: &[TargetCard]| Plan {
        character,
        targets: targets.iter().copied().collect(),
    };
    assert_eq!(
        api::validate_plan(&plan(Character::Seer, &[TargetCard::Fool]), &config),
        None
    );
    assert_eq!(
        api::validate_plan(&plan(Character::Witch, &[]), &config),
        Some("error-too-few-targets")
    );
    assert_eq!(
        api::validate_plan(
            &plan(Character::Hunter, &[TargetCard::Character(Character::Seer)]),
            &config
        ),
        Some("error-target-not-allowed")
    );
}

#[test]
fn effective_initiative_and_showdown_order() {
    use wwd_core::Character;

    assert_eq!(api::effective_initiative(Character::Seer, 2), 3);
    assert_eq!(api::effective_initiative(Character::Hunter, 2), 0);
    assert_eq!(api::showdown_order(&game().view(Viewer::Spectator)), None);
}

/// A game played with the first legal actions until round 1 ends.
fn at_round_over() -> Game {
    let mut game = game();
    while game.round_boundary().is_none() {
        let seat = game.pending().seats[0];
        let cmd = game.legal_actions(seat)[0].clone();
        game.apply(seat, cmd).unwrap();
    }
    game
}

#[test]
fn resume_continues_and_rejects_a_mismatched_boundary() {
    let played = at_round_over();
    let boundary = played.round_boundary().unwrap();
    let new_seed = "02".repeat(32);
    let resumed = Game::resume(boundary.clone(), played.replay(), &new_seed).unwrap();
    assert_eq!(resumed.replay().segments.len(), 2);
    let first = &resumed.events_since(0, Viewer::Spectator)[0].1;
    assert_eq!(api::event_id(&first.kind), "event-segment-started");

    let mut mismatched = boundary.clone();
    mismatched.badge = mismatched.badge.other();
    let err = Game::resume(mismatched, played.replay(), &new_seed)
        .err()
        .unwrap();
    assert!(err.id.starts_with("error-replay-"), "{}", err.id);
    let err = Game::resume(boundary, played.replay(), "zz").err().unwrap();
    assert_eq!(err.id, "error-invalid-input");
}

#[test]
fn replay_timeline_has_a_step_per_entry() {
    let played = at_round_over();
    let replay = played.replay();
    let steps = api::replay_timeline(&replay, Viewer::Seat(Seat::P1)).unwrap();
    assert_eq!(steps.len(), 1 + replay.segments[0].entries.len());
    assert_eq!(
        steps.last().unwrap().view,
        played.view(Viewer::Seat(Seat::P1))
    );

    let mut tampered = replay;
    tampered.segments[0].seed = [9; 32];
    let err = api::replay_timeline(&tampered, Viewer::Spectator).unwrap_err();
    assert!(err.id.starts_with("error-replay-"), "{}", err.id);
}

#[test]
fn content_hash_matches_the_blake3_test_vector() {
    assert_eq!(
        api::content_hash(""),
        "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
    );
}

#[test]
fn ability_summary_serialises_for_the_card_icons() {
    use wwd_core::Character;
    let json = serde_json::to_value(api::ability_summary(Character::WolfKing)).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "gains": [],
            "spends": { "per_extra_target": "fang" },
            "attack": { "faction": "human", "max": null },
            "damage": 1,
            "optional_cross": false,
        })
    );
}
