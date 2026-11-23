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
