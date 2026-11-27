use proptest::prelude::*;
use wwd_core::{
    Character, Command, Phase, ReplayEntry, RulesConfig, check_invariants, fuzz, hash, random_game,
    verify,
};

// Uniform random play wins on Crosses in roughly one game in a thousand, so this
// expects the seed and game count below to cover all three win reasons.
#[test]
fn fuzz_1000_games() {
    let report = fuzz(1000, [42; 32]).expect("every fuzzed game is valid");
    assert_eq!(report.games, 1000);
    assert_eq!(report.wins[0] + report.wins[1], 1000);
    for reason in ["health", "fangs", "crosses"] {
        assert!(
            report.by_reason.get(reason).copied().unwrap_or(0) > 0,
            "coverage-by-seed expectation failed: no game ended by {reason}: {:?}",
            report.by_reason
        );
    }
    assert_eq!(report.by_reason.values().sum::<u32>(), 1000);
}

#[test]
fn fuzz_is_deterministic() {
    assert_eq!(fuzz(20, [3; 32]), fuzz(20, [3; 32]));
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn any_seed_game_is_valid(seed in any::<[u8; 32]>(), chooser in any::<[u8; 32]>()) {
        let (replay, state) = random_game(seed, RulesConfig::default(), chooser);
        let over = matches!(state.phase, Phase::GameOver { .. });
        prop_assert!(over);
        prop_assert!(check_invariants(&state).is_ok());
        prop_assert!(verify(&replay).is_ok());
    }
}

#[test]
fn ids_are_the_kebab_case_of_the_serde_names() {
    let kebab = |json: serde_json::Value| -> String {
        let name = match json {
            serde_json::Value::String(name) => name,
            serde_json::Value::Object(map) => map.keys().next().unwrap().clone(),
            other => panic!("unexpected {other}"),
        };
        name.replace('_', "-")
    };
    let (_, state) = random_game([1; 32], RulesConfig::default(), [2; 32]);
    for event in &state.log {
        let name = kebab(serde_json::to_value(&event.kind).unwrap());
        assert_eq!(event.kind.id(), format!("event-{name}"));
    }
    for character in Character::ALL {
        let name = kebab(serde_json::to_value(character).unwrap());
        assert_eq!(character.id(), format!("character-{name}"));
        let faction = character.faction();
        let name = kebab(serde_json::to_value(faction).unwrap());
        assert_eq!(faction.id(), format!("faction-{name}"));
    }
}

/// Pins the final hash of a fixed multi-round game, so any change to the rules, the
/// random stream or the canonical encoding is noticed.
#[test]
fn golden_cross_round_hash() {
    let (replay, state) = random_game([10; 32], RulesConfig::default(), [0; 32]);
    let commands: Vec<&Command> = replay.segments[0]
        .entries
        .iter()
        .filter_map(|entry| match entry {
            ReplayEntry::Command { cmd, .. } => Some(cmd),
            ReplayEntry::Edit(_) => None,
        })
        .collect();
    assert!(state.round >= 3, "the game spans {} rounds", state.round);
    assert!(
        commands
            .iter()
            .any(|c| matches!(c, Command::HunterSpendCross { .. }))
    );
    assert!(
        commands
            .iter()
            .any(|c| matches!(c, Command::ChoosePotionTarget { .. }))
    );
    let hex: String = hash(&state).iter().map(|b| format!("{b:02x}")).collect();
    assert_eq!(
        hex,
        "138f63a1593e2150df3bd0a14c8919d02e7db5f1ae3c54da7438e04ee8922cf9"
    );
}
