mod common;

use common::assert_conserved;
use wwd_core::{
    BadgeStart, Character, Phase, RulesConfig, Seat, Supply, hash, hash_bytes, new_game,
};

fn config(badge: Seat) -> RulesConfig {
    RulesConfig {
        badge_start: BadgeStart::Seat(badge),
        ..RulesConfig::default()
    }
}

#[test]
fn setup_markers() {
    let state = new_game([1; 32], config(Seat::P0));
    let [p0, p1] = &state.players;
    assert_eq!((p0.health, p0.cross, p0.hourglass), (2, 1, 0));
    assert_eq!((p1.health, p1.cross, p1.hourglass), (2, 1, 1));
    assert_eq!(
        state.supply,
        Supply {
            cross: 5,
            fang: 5,
            hourglass: 4,
            potion: true
        }
    );
    assert_eq!(state.badge, Seat::P0);
    assert_eq!(state.phase, Phase::Plan);
    assert_eq!(state.round, 1);
}

#[test]
fn round_one_deal_sizes() {
    for badge in [Seat::P0, Seat::P1] {
        let state = new_game([2; 32], config(badge));
        assert_eq!(state.player(badge).hand.len(), 4);
        assert_eq!(state.player(badge.other()).hand.len(), 3);
        let mut all: Vec<Character> = state
            .players
            .iter()
            .flat_map(|p| p.hand.iter().copied())
            .chain(state.discard)
            .collect();
        all.sort();
        assert_eq!(all, Character::ALL.to_vec());
        for p in &state.players {
            assert!(p.hand.windows(2).all(|w| w[0] < w[1]));
        }
    }
}

#[test]
fn deal_is_seed_deterministic() {
    let a = new_game([3; 32], RulesConfig::default());
    let b = new_game([3; 32], RulesConfig::default());
    let c = new_game([4; 32], RulesConfig::default());
    assert_eq!(hash_bytes(&a), hash_bytes(&b));
    assert_eq!(hash(&a), hash_bytes(&a));
    assert_ne!(hash_bytes(&a), hash_bytes(&c));
}

#[test]
fn badge_start_random_and_chosen() {
    let badge_of = |seed: u8| new_game([seed; 32], RulesConfig::default()).badge;
    let badges: Vec<Seat> = (0..32u8).map(badge_of).collect();
    assert!(badges.contains(&Seat::P0) && badges.contains(&Seat::P1));
    assert!((0..32u8).all(|seed| badge_of(seed) == badges[usize::from(seed)]));

    for badge in [Seat::P0, Seat::P1] {
        let state = new_game([9; 32], config(badge));
        assert_eq!(state.badge, badge);
        assert_eq!(state.player(badge).hourglass, 0);
        assert_eq!(state.player(badge.other()).hourglass, 1);
    }
}

#[test]
fn marker_totals_conserved() {
    for seed in 0..8u8 {
        assert_conserved(&new_game([seed; 32], RulesConfig::default()));
    }
}

#[cfg(feature = "unsafe-edit")]
mod edits {
    use super::*;
    use wwd_core::{Edit, EditError, apply_edit};

    fn hands() -> [Vec<Character>; 2] {
        [
            vec![
                Character::Knight,
                Character::Seer,
                Character::Villager,
                Character::WolfKing,
            ],
            vec![Character::Wolfen, Character::Witch, Character::Hunter],
        ]
    }

    #[test]
    fn edit_set_hands_and_taint() {
        let mut state = new_game([5; 32], config(Seat::P0));
        assert!(!state.tainted);
        apply_edit(
            &mut state,
            Edit::SetHands {
                hands: hands(),
                discard: Character::WolfBeauty,
            },
        )
        .unwrap();
        assert!(state.tainted);
        assert_eq!(
            state.players[0].hand,
            vec![
                Character::WolfKing,
                Character::Knight,
                Character::Seer,
                Character::Villager
            ]
        );
        assert_eq!(state.discard, Some(Character::WolfBeauty));
        assert_conserved(&state);

        let mut bad = hands();
        bad[1][0] = Character::Knight;
        let mut state = new_game([5; 32], config(Seat::P0));
        assert_eq!(
            apply_edit(
                &mut state,
                Edit::SetHands {
                    hands: bad,
                    discard: Character::WolfBeauty
                }
            ),
            Err(EditError::InvalidHands)
        );
        assert!(!state.tainted);
    }

    #[test]
    fn edit_markers_keep_totals() {
        let mut state = new_game([6; 32], config(Seat::P0));
        apply_edit(
            &mut state,
            Edit::SetCross {
                seat: Seat::P0,
                n: 3,
            },
        )
        .unwrap();
        apply_edit(
            &mut state,
            Edit::SetFang {
                seat: Seat::P1,
                n: 2,
            },
        )
        .unwrap();
        apply_edit(
            &mut state,
            Edit::SetHourglass {
                seat: Seat::P0,
                n: 2,
            },
        )
        .unwrap();
        apply_edit(
            &mut state,
            Edit::SetPotion {
                seat: Some(Seat::P1),
            },
        )
        .unwrap();
        assert_conserved(&state);
        apply_edit(&mut state, Edit::SetPotion { seat: None }).unwrap();
        assert_conserved(&state);
        assert_eq!(
            apply_edit(
                &mut state,
                Edit::SetHourglass {
                    seat: Seat::P1,
                    n: 7
                }
            ),
            Err(EditError::SupplyExceeded)
        );
        assert_conserved(&state);
    }
}
