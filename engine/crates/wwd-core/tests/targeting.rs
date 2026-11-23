use std::collections::BTreeSet;

use wwd_core::Character::*;
use wwd_core::{
    Character, Faction, MinTargets, Plan, RuleError, RulesConfig, TargetCard, validate_plan,
};

fn plan(character: Character, targets: &[TargetCard]) -> Plan {
    Plan {
        character,
        targets: targets.iter().copied().collect::<BTreeSet<_>>(),
    }
}

fn check(character: Character, targets: &[TargetCard]) -> Result<(), RuleError> {
    validate_plan(&plan(character, targets), &RulesConfig::default())
}

fn c(character: Character) -> TargetCard {
    TargetCard::Character(character)
}

const FOOL: TargetCard = TargetCard::Fool;

#[test]
fn initiatives_and_factions() {
    for (i, ch) in Character::ALL.iter().enumerate() {
        assert_eq!(ch.initiative() as usize, i + 1);
    }
    let wolves: Vec<Character> = Character::ALL
        .into_iter()
        .filter(|ch| ch.faction() == Faction::Werewolf)
        .collect();
    assert_eq!(wolves, vec![WolfKing, Wolfen, WolfBeauty]);
}

#[test]
fn knight_accepts_werewolf_and_fool() {
    assert_eq!(check(Knight, &[c(Wolfen), FOOL]), Ok(()));
    assert_eq!(check(Knight, &[c(Seer)]), Err(RuleError::TargetNotAllowed));
    assert_eq!(
        check(Knight, &[c(Wolfen), c(WolfKing)]),
        Err(RuleError::TooManyTargets)
    );
}

#[test]
fn hunter_two_werewolves() {
    assert_eq!(check(Hunter, &[c(Wolfen), c(WolfBeauty), FOOL]), Ok(()));
    assert_eq!(
        check(Hunter, &[c(Wolfen), c(WolfBeauty), c(WolfKing)]),
        Err(RuleError::TooManyTargets)
    );
}

#[test]
fn wolf_king_any_number_of_humans() {
    let humans = [c(Hunter), c(Knight), c(Seer), c(Witch), c(Villager), FOOL];
    assert_eq!(check(WolfKing, &humans), Ok(()));
    assert_eq!(
        check(WolfKing, &[c(Wolfen)]),
        Err(RuleError::TargetNotAllowed)
    );
}

#[test]
fn villager_and_witch_fool_only() {
    for ch in [Villager, Witch] {
        assert_eq!(check(ch, &[FOOL]), Ok(()));
        assert_eq!(check(ch, &[]), Err(RuleError::TooFewTargets));
        let relaxed = RulesConfig {
            min_targets: MinTargets::Zero,
            ..RulesConfig::default()
        };
        assert_eq!(validate_plan(&plan(ch, &[]), &relaxed), Ok(()));
        assert_eq!(check(ch, &[c(Seer)]), Err(RuleError::TargetNotAllowed));
    }
}

#[test]
fn wolfen_and_beauty_any_one() {
    for ch in [Wolfen, WolfBeauty] {
        assert_eq!(check(ch, &[c(Seer)]), Ok(()));
        assert_eq!(check(ch, &[c(WolfKing)]), Ok(()));
        assert_eq!(
            check(ch, &[c(Seer), c(Knight)]),
            Err(RuleError::TooManyTargets)
        );
    }
}

#[test]
fn serde_ids_are_snake_case() {
    assert_eq!(
        serde_json::to_string(&WolfBeauty).unwrap(),
        "\"wolf_beauty\""
    );
    assert_eq!(serde_json::to_string(&FOOL).unwrap(), "\"fool\"");
    assert_eq!(
        serde_json::to_string(&c(Seer)).unwrap(),
        "{\"character\":\"seer\"}"
    );
}

#[test]
fn ids_and_ordering() {
    assert_eq!(WolfKing.id(), "character-wolf-king");
    assert_eq!(WolfBeauty.id(), "character-wolf-beauty");
    assert_eq!(WolfKing.faction().id(), "faction-werewolf");
    assert_eq!(Seer.faction().id(), "faction-human");
    assert_eq!(RuleError::TargetNotAllowed.id(), "error-target-not-allowed");
    assert!(c(Villager) < FOOL);
    assert!(c(Hunter) < c(WolfKing));
}

#[test]
fn seat_serialises_lowercase() {
    assert_eq!(
        serde_json::to_string(&wwd_core::Seat::P0).unwrap(),
        "\"p0\""
    );
    assert_eq!(
        serde_json::to_string(&wwd_core::Seat::P1).unwrap(),
        "\"p1\""
    );
}

#[test]
fn min_targets_is_zero_or_one_and_serialises_as_a_number() {
    assert_eq!(serde_json::to_string(&MinTargets::One).unwrap(), "1");
    assert_eq!(serde_json::to_string(&MinTargets::Zero).unwrap(), "0");
    assert_eq!(
        serde_json::from_str::<MinTargets>("0").unwrap(),
        MinTargets::Zero
    );
    assert!(serde_json::from_str::<MinTargets>("2").is_err());
    assert!(MinTargets::try_from(2).is_err());

    let mut config = serde_json::to_value(RulesConfig::default()).unwrap();
    assert_eq!(config["min_targets"], 1);
    config["min_targets"] = 2.into();
    assert!(serde_json::from_value::<RulesConfig>(config).is_err());
}

#[test]
fn each_player_has_nine_target_cards() {
    let cards: BTreeSet<TargetCard> = Character::ALL
        .into_iter()
        .map(TargetCard::Character)
        .chain([FOOL])
        .collect();
    assert_eq!(cards.len(), 9);
    // Every card a single-target plan can name is one of the nine, and each is nameable.
    let nameable: BTreeSet<TargetCard> = Character::ALL
        .into_iter()
        .flat_map(|character| {
            cards
                .iter()
                .copied()
                .filter(move |&card| check(character, &[card]).is_ok())
        })
        .collect();
    assert_eq!(nameable, cards);
}
