#![cfg(feature = "unsafe-edit")]

mod common;

use common::{assert_conserved, scenario};
use wwd_core::Character::*;
use wwd_core::{
    Character, Command, Edit, Event, EventKind, ForfeitReason, Marker, Phase, PotionTarget,
    RuleError, Seat, State, TargetCard, Visibility, apply, apply_edit,
};

fn c(character: Character) -> TargetCard {
    TargetCard::Character(character)
}

fn submit(state: &mut State, seat: Seat, character: Character, targets: &[TargetCard]) {
    apply(
        state,
        seat,
        Command::SubmitPlan {
            character,
            targets: targets.to_vec(),
        },
    )
    .expect("plan should be accepted");
}

/// Submits both plans, then places hourglasses in Badge order, returning the events of
/// the final placement.
fn play(
    state: &mut State,
    p0: (Character, &[TargetCard]),
    p1: (Character, &[TargetCard]),
    placed: [u8; 2],
) -> Vec<Event> {
    submit(state, Seat::P0, p0.0, p0.1);
    submit(state, Seat::P1, p1.0, p1.1);
    let badge = state.badge;
    let mut events = Vec::new();
    for seat in [badge, badge.other()] {
        events = apply(
            state,
            seat,
            Command::PlaceHourglasses {
                n: placed[seat.index()],
            },
        )
        .expect("placement should be accepted");
    }
    events
}

fn kinds(events: &[Event]) -> Vec<EventKind> {
    events.iter().map(|e| e.kind.clone()).collect()
}

fn resolved(events: &[Event], seat: Seat) -> usize {
    events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::CharacterResolved { seat: s, .. } if s == seat))
        .count()
}

fn set_hourglass(state: &mut State, seat: Seat, n: u8) {
    apply_edit(state, Edit::SetHourglass { seat, n }).unwrap();
}

/// Badge on P0, humans against werewolves, Villager discarded.
fn humans_vs_wolves() -> State {
    scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    )
}

/// Badge on P0, P0 holds the werewolves, Witch discarded.
fn wolves_vs_humans() -> State {
    scenario(
        Seat::P0,
        &[WolfKing, Wolfen, WolfBeauty, Villager],
        &[Hunter, Knight, Seer],
        Witch,
    )
}

#[test]
fn lower_initiative_attacks_first_and_wins() {
    let mut state = humans_vs_wolves();
    let events = play(
        &mut state,
        (Knight, &[c(Wolfen)]),
        (Wolfen, &[c(Knight)]),
        [0, 0],
    );
    let kinds = kinds(&events);
    let resolved_at = kinds
        .iter()
        .position(|k| {
            *k == EventKind::CharacterResolved {
                seat: Seat::P0,
                character: Knight,
            }
        })
        .unwrap();
    assert_eq!(
        kinds[resolved_at + 1..resolved_at + 3],
        [
            EventKind::MarkerGained {
                seat: Seat::P0,
                marker: Marker::Hourglass,
                from_opponent: false,
            },
            EventKind::AttackHit {
                seat: Seat::P0,
                target_seat: Seat::P1,
                attacker: Knight,
                character: Wolfen,
                health_lost: 1,
            },
        ]
    );
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert!(
        events
            .iter()
            .filter(|e| matches!(e.kind, EventKind::CharacterResolved { .. }))
            .all(|e| e.visibility == Visibility::Public)
    );
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_eq!(state.player(Seat::P0).health, 2);
    assert_eq!(state.player(Seat::P0).hourglass, 1);
    assert_eq!(state.player(Seat::P1).hourglass, 1);
    assert_eq!(state.round, 1);
    assert_eq!(state.phase, Phase::RoundOver);
    assert_conserved(&state);
}

#[test]
fn resolved_character_is_immune() {
    let mut state = wolves_vs_humans();
    let events = play(
        &mut state,
        (Wolfen, &[c(Seer)]),
        (Seer, &[c(Wolfen)]),
        [0, 0],
    );
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert_eq!(state.player(Seat::P0).health, 2);
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_conserved(&state);

    // The Wolfen misses and resolves first, so the Seer's matching target finds it immune.
    let mut state = wolves_vs_humans();
    let events = play(
        &mut state,
        (Wolfen, &[c(Hunter)]),
        (Seer, &[c(Wolfen)]),
        [0, 0],
    );
    let kinds = kinds(&events);
    assert!(kinds.contains(&EventKind::AttackMissed {
        seat: Seat::P0,
        attacker: Wolfen,
    }));
    assert!(kinds.contains(&EventKind::AttackMissed {
        seat: Seat::P1,
        attacker: Seer,
    }));
    assert_eq!(resolved(&events, Seat::P1), 1);
    assert_eq!(state.player(Seat::P0).health, 2);
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_conserved(&state);
}

/// P0 Wolfen→{Seer} against P1 Seer→{Wolfen}, with P1 placing 2 Hourglasses.
fn seer_strikes_first() -> (State, Vec<Event>) {
    let mut state = wolves_vs_humans();
    set_hourglass(&mut state, Seat::P1, 2);
    let events = play(
        &mut state,
        (Wolfen, &[c(Seer)]),
        (Seer, &[c(Wolfen)]),
        [0, 2],
    );
    (state, events)
}

#[test]
fn hourglasses_let_seer_strike_first() {
    let (state, events) = seer_strikes_first();
    let (_, effective, order) = events
        .iter()
        .find_map(|e| match &e.kind {
            EventKind::PlansRevealed {
                plans,
                effective,
                order,
            } => Some((plans.clone(), *effective, *order)),
            _ => None,
        })
        .unwrap();
    assert_eq!(effective, [4, 3]);
    assert_eq!(order, [Seat::P1, Seat::P0]);
    assert_eq!(state.player(Seat::P0).health, 0);
    assert_eq!(resolved(&events, Seat::P0), 0);
    assert_eq!(state.player(Seat::P0).hourglass, 0);
    assert!(
        !kinds(&events)
            .iter()
            .any(|k| matches!(k, EventKind::MarkerGained { seat: Seat::P0, .. }))
    );
    assert_conserved(&state);
}

#[test]
fn seer_deals_two() {
    let (state, events) = seer_strikes_first();
    assert!(kinds(&events).contains(&EventKind::AttackHit {
        seat: Seat::P1,
        target_seat: Seat::P0,
        attacker: Seer,
        character: Wolfen,
        health_lost: 2,
    }));
    assert_conserved(&state);
}

fn hunter_vs_wolf_beauty() -> (State, Vec<Event>) {
    let mut state = humans_vs_wolves();
    let events = play(
        &mut state,
        (Hunter, &[c(Wolfen), c(WolfBeauty)]),
        (WolfBeauty, &[c(Knight)]),
        [0, 0],
    );
    (state, events)
}

fn hunter_choice(state: &mut State, seat: Seat, spend: bool) -> Result<Vec<Event>, RuleError> {
    apply(state, seat, Command::HunterSpendCross { spend })
}

#[test]
fn hunter_choice_spend_and_decline() {
    let (mut state, events) = hunter_vs_wolf_beauty();
    assert_eq!(state.phase, Phase::HunterChoice { seat: Seat::P0 });
    assert_eq!(
        kinds(&events).last(),
        Some(&EventKind::CharacterResolved {
            seat: Seat::P0,
            character: Hunter,
        })
    );
    assert_eq!(
        hunter_choice(&mut state, Seat::P1, true),
        Err(RuleError::NotYourTurn)
    );
    assert_eq!(
        apply(&mut state, Seat::P0, Command::PlaceHourglasses { n: 0 }),
        Err(RuleError::WrongPhase)
    );
    assert_conserved(&state);

    let supply_cross = state.supply.cross;
    let events = hunter_choice(&mut state, Seat::P0, true).unwrap();
    assert_eq!(
        kinds(&events)[..2],
        [
            EventKind::MarkerSpent {
                seat: Seat::P0,
                marker: Marker::Cross,
                n: 1,
            },
            EventKind::AttackHit {
                seat: Seat::P0,
                target_seat: Seat::P1,
                attacker: Hunter,
                character: WolfBeauty,
                health_lost: 1,
            },
        ]
    );
    assert_eq!(state.player(Seat::P0).cross, 0);
    assert_eq!(state.supply.cross, supply_cross + 1);
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_eq!(state.player(Seat::P1).fang, 0);
    assert_eq!(resolved(&state.log, Seat::P0), 1);
    assert_eq!(resolved(&state.log, Seat::P1), 0);
    assert_eq!(state.round, 1);
    assert_eq!(state.phase, Phase::RoundOver);
    assert_conserved(&state);

    let (mut state, _) = hunter_vs_wolf_beauty();
    let events = hunter_choice(&mut state, Seat::P0, false).unwrap();
    let kinds = kinds(&events);
    assert_eq!(
        kinds[0],
        EventKind::AttackForfeited {
            seat: Seat::P0,
            reason: ForfeitReason::Declined,
        }
    );
    assert_eq!(
        kinds[1..4],
        [
            EventKind::CharacterResolved {
                seat: Seat::P1,
                character: WolfBeauty,
            },
            EventKind::MarkerGained {
                seat: Seat::P1,
                marker: Marker::Fang,
                from_opponent: false,
            },
            EventKind::AttackMissed {
                seat: Seat::P1,
                attacker: WolfBeauty,
            },
        ]
    );
    assert_eq!(state.player(Seat::P0).cross, 1);
    assert_eq!(state.player(Seat::P1).fang, 1);
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_eq!(resolved(&state.log, Seat::P0), 1);
    assert_conserved(&state);
}

#[test]
fn hunter_without_cross_forfeits() {
    let mut state = humans_vs_wolves();
    apply_edit(
        &mut state,
        Edit::SetCross {
            seat: Seat::P0,
            n: 0,
        },
    )
    .unwrap();
    let events = play(
        &mut state,
        (Hunter, &[c(Wolfen), c(WolfBeauty)]),
        (WolfBeauty, &[c(Knight)]),
        [0, 0],
    );
    assert!(kinds(&events).contains(&EventKind::AttackForfeited {
        seat: Seat::P0,
        reason: ForfeitReason::NoCross,
    }));
    assert_eq!(resolved(&events, Seat::P1), 1);
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_eq!(state.phase, Phase::RoundOver);
    assert_eq!(state.round, 1);
    assert_conserved(&state);
}

/// P0 Wolf King with `fang` Fangs and the given targets against P1 Seer→{Wolfen}.
fn wolf_king(fang: u8, targets: &[TargetCard]) -> (State, Vec<Event>) {
    let mut state = wolves_vs_humans();
    apply_edit(
        &mut state,
        Edit::SetFang {
            seat: Seat::P0,
            n: fang,
        },
    )
    .unwrap();
    let events = play(
        &mut state,
        (WolfKing, targets),
        (Seer, &[c(Wolfen)]),
        [0, 0],
    );
    (state, events)
}

#[test]
fn wolf_king_payment_edges() {
    let (state, events) = wolf_king(1, &[TargetCard::Fool]);
    assert!(kinds(&events).contains(&EventKind::AttackForfeited {
        seat: Seat::P0,
        reason: ForfeitReason::NoTargets,
    }));
    assert_eq!(state.player(Seat::P0).fang, 1);
    assert_conserved(&state);

    let humans = [c(Seer), c(Knight), c(Villager)];
    let (state, events) = wolf_king(1, &humans);
    let kinds_b = kinds(&events);
    assert!(kinds_b.contains(&EventKind::AttackForfeited {
        seat: Seat::P0,
        reason: ForfeitReason::CannotPayFangs,
    }));
    assert!(!kinds_b.iter().any(|k| matches!(
        k,
        EventKind::MarkerSpent { .. } | EventKind::AttackHit { .. }
    )));
    assert_eq!(state.player(Seat::P0).fang, 1);
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_eq!(resolved(&events, Seat::P1), 1);
    assert_conserved(&state);

    let (state, events) = wolf_king(2, &humans);
    let kinds_c = kinds(&events);
    let resolved_at = kinds_c
        .iter()
        .position(|k| {
            *k == EventKind::CharacterResolved {
                seat: Seat::P0,
                character: WolfKing,
            }
        })
        .unwrap();
    assert_eq!(
        kinds_c[resolved_at + 1..resolved_at + 3],
        [
            EventKind::MarkerSpent {
                seat: Seat::P0,
                marker: Marker::Fang,
                n: 2,
            },
            EventKind::AttackHit {
                seat: Seat::P0,
                target_seat: Seat::P1,
                attacker: WolfKing,
                character: Seer,
                health_lost: 1,
            },
        ]
    );
    assert_eq!(state.player(Seat::P0).fang, 0);
    assert_eq!(state.supply.fang, 5);
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert_conserved(&state);
}

#[test]
fn witch_gains_potion_and_must_spend_next_round() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Witch, Villager],
        &[WolfKing, Wolfen, WolfBeauty],
        Seer,
    );
    let events = play(
        &mut state,
        (Witch, &[TargetCard::Fool]),
        (Wolfen, &[c(Knight)]),
        [0, 0],
    );
    assert!(kinds(&events).contains(&EventKind::MarkerGained {
        seat: Seat::P0,
        marker: Marker::Potion,
        from_opponent: false,
    }));
    assert!(state.player(Seat::P0).potion);
    assert!(!state.supply.potion);
    assert_eq!(state.round, 1);
    assert_eq!(state.phase, Phase::RoundOver);
    assert_eq!(state.badge, Seat::P1);
    assert_conserved(&state);
    for seat in [Seat::P0, Seat::P1] {
        apply(&mut state, seat, Command::NextRound).unwrap();
    }

    apply_edit(
        &mut state,
        Edit::SetHands {
            hands: [
                vec![Hunter, Knight, Seer],
                vec![WolfKing, Wolfen, WolfBeauty, Villager],
            ],
            discard: Witch,
        },
    )
    .unwrap();
    submit(&mut state, Seat::P0, Knight, &[c(WolfBeauty)]);
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);
    apply(&mut state, Seat::P1, Command::PlaceHourglasses { n: 0 }).unwrap();
    apply(&mut state, Seat::P0, Command::PlaceHourglasses { n: 0 }).unwrap();
    assert_eq!(state.phase, Phase::RevealPotion { seat: Seat::P0 });

    let events = apply(
        &mut state,
        Seat::P0,
        Command::ChoosePotionTarget { card: Wolfen },
    )
    .unwrap();
    let kinds = kinds(&events);
    let potion_at = kinds
        .iter()
        .position(|k| {
            *k == EventKind::PotionResolved {
                target: Wolfen,
                victim: Seat::P1,
                hit: true,
                health_lost: 1,
            }
        })
        .unwrap();
    let first_resolved = kinds
        .iter()
        .position(|k| matches!(k, EventKind::CharacterResolved { .. }))
        .unwrap();
    assert!(potion_at < first_resolved);
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert!(state.supply.potion);
    assert!(state.potion_target.is_none());
    assert_conserved(&state);
}

#[test]
fn potion_eliminated_character_cannot_be_hit_again() {
    let mut state = humans_vs_wolves();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]);
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);
    apply(&mut state, Seat::P0, Command::PlaceHourglasses { n: 0 }).unwrap();
    // Commands cannot aim the Potion at a card the holder's plan also targets, so set it here.
    state.potion_target = Some(PotionTarget {
        holder: Seat::P0,
        card: Wolfen,
    });
    let events = apply(&mut state, Seat::P1, Command::PlaceHourglasses { n: 0 }).unwrap();
    let kinds = kinds(&events);
    assert!(kinds.contains(&EventKind::PotionResolved {
        target: Wolfen,
        victim: Seat::P1,
        hit: true,
        health_lost: 1,
    }));
    assert!(kinds.contains(&EventKind::AttackMissed {
        seat: Seat::P0,
        attacker: Knight,
    }));
    assert!(
        !kinds
            .iter()
            .any(|k| matches!(k, EventKind::AttackHit { .. }))
    );
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_eq!(state.player(Seat::P0).health, 2);
    assert_conserved(&state);
}

/// Empties the hourglass supply with P1 holding `p1_reserve` plus 2 to place, then plays
/// P0 Knight against P1 Wolf Beauty with P1 placing 2.
fn knight_with_empty_supply(p1_reserve: u8) -> (State, Vec<Event>) {
    let mut state = humans_vs_wolves();
    set_hourglass(&mut state, Seat::P1, p1_reserve + 2);
    set_hourglass(&mut state, Seat::P0, 3 - p1_reserve);
    assert_eq!(state.supply.hourglass, 0);
    let events = play(
        &mut state,
        (Knight, &[c(Wolfen)]),
        (WolfBeauty, &[c(Seer)]),
        [0, 2],
    );
    (state, events)
}

#[test]
fn hourglass_gain_takes_from_opponent_reserve_only() {
    let (state, events) = knight_with_empty_supply(1);
    assert!(kinds(&events).contains(&EventKind::MarkerGained {
        seat: Seat::P0,
        marker: Marker::Hourglass,
        from_opponent: true,
    }));
    assert_eq!(state.player(Seat::P0).hourglass, 2 + 1);
    assert_eq!(state.player(Seat::P1).hourglass, 0);
    // P1's two placed Hourglasses survive the gain and return to the supply at round end.
    assert_eq!(state.supply.hourglass, 2);
    assert_conserved(&state);

    let (state, events) = knight_with_empty_supply(0);
    assert!(
        !kinds(&events)
            .iter()
            .any(|k| matches!(k, EventKind::MarkerGained { seat: Seat::P0, .. }))
    );
    assert_eq!(state.player(Seat::P0).hourglass, 3);
    assert_eq!(state.player(Seat::P1).hourglass, 0);
    assert_eq!(state.supply.hourglass, 2);
    assert_conserved(&state);
}

#[test]
fn wolf_king_single_target_pays_nothing() {
    for targets in [&[c(Seer)][..], &[c(Seer), TargetCard::Fool][..]] {
        let (state, events) = wolf_king(0, targets);
        let kinds = kinds(&events);
        assert!(
            !kinds
                .iter()
                .any(|k| matches!(k, EventKind::MarkerSpent { .. })),
            "{targets:?}"
        );
        assert!(kinds.contains(&EventKind::AttackHit {
            seat: Seat::P0,
            target_seat: Seat::P1,
            attacker: WolfKing,
            character: Seer,
            health_lost: 1,
        }));
        assert_eq!(state.player(Seat::P0).fang, 0);
        assert_eq!(state.player(Seat::P1).health, 1);
        assert_eq!(resolved(&events, Seat::P1), 0);
        assert_conserved(&state);
    }
}

#[test]
fn hunter_spend_without_cross_forfeits() {
    let (mut state, _) = hunter_vs_wolf_beauty();
    apply_edit(
        &mut state,
        Edit::SetCross {
            seat: Seat::P0,
            n: 0,
        },
    )
    .unwrap();
    let events = hunter_choice(&mut state, Seat::P0, true).unwrap();
    let kinds = kinds(&events);
    assert_eq!(
        kinds[0],
        EventKind::AttackForfeited {
            seat: Seat::P0,
            reason: ForfeitReason::NoCross,
        }
    );
    assert!(!kinds.iter().any(|k| matches!(
        k,
        EventKind::MarkerSpent { .. } | EventKind::AttackHit { .. }
    )));
    assert_eq!(state.player(Seat::P0).cross, 0);
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_eq!(resolved(&state.log, Seat::P1), 1);
    assert_conserved(&state);
}

/// P0 holds the Potion and plays Knight→{Wolfen}; P1 plays `character`→{Fool}.
fn potion_round(
    p1_hand: &[Character],
    character: Character,
    target: Character,
) -> (State, Vec<Event>) {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Villager],
        p1_hand,
        WolfBeauty,
    );
    apply_edit(
        &mut state,
        Edit::SetPotion {
            seat: Some(Seat::P0),
        },
    )
    .unwrap();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]);
    submit(&mut state, Seat::P1, character, &[TargetCard::Fool]);
    apply(&mut state, Seat::P0, Command::PlaceHourglasses { n: 0 }).unwrap();
    apply(&mut state, Seat::P1, Command::PlaceHourglasses { n: 0 }).unwrap();
    let events = apply(
        &mut state,
        Seat::P0,
        Command::ChoosePotionTarget { card: target },
    )
    .unwrap();
    (state, events)
}

#[test]
fn potion_eliminates_the_witch() {
    let (state, events) = potion_round(&[WolfKing, Wolfen, Witch], Witch, Witch);
    assert!(kinds(&events).contains(&EventKind::PotionResolved {
        target: Witch,
        victim: Seat::P1,
        hit: true,
        health_lost: 1,
    }));
    assert_eq!(state.player(Seat::P1).health, 1);
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert!(!state.player(Seat::P1).potion);
    assert!(state.supply.potion);
    assert_conserved(&state);
}

#[test]
fn potion_naming_a_card_the_opponent_did_not_play_misses() {
    let (state, events) = potion_round(&[WolfKing, Wolfen, Witch], Witch, Hunter);
    assert!(kinds(&events).contains(&EventKind::PotionResolved {
        target: Hunter,
        victim: Seat::P1,
        hit: false,
        health_lost: 0,
    }));
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_eq!(resolved(&events, Seat::P1), 1);
    assert_conserved(&state);
}

#[test]
fn empty_cross_supply_gains_nothing_without_panicking() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Villager],
        &[WolfKing, Wolfen, WolfBeauty],
        Witch,
    );
    // Only a hand-crafted state can reach this: real games end before the supply runs out.
    state.players[1].cross += state.supply.cross;
    state.supply.cross = 0;
    let events = play(
        &mut state,
        (Villager, &[TargetCard::Fool]),
        (WolfBeauty, &[TargetCard::Fool]),
        [0, 0],
    );
    assert!(!kinds(&events).iter().any(|k| matches!(
        k,
        EventKind::MarkerGained {
            marker: Marker::Cross,
            ..
        }
    )));
    assert_eq!(state.player(Seat::P0).cross, 1);
    assert_eq!(state.supply.cross, 0);
}

#[test]
fn villager_gains_exactly_one_cross() {
    let mut state = wolves_vs_humans();
    let before = state.clone();
    let events = play(
        &mut state,
        (Villager, &[TargetCard::Fool]),
        (Seer, &[TargetCard::Fool]),
        [0, 0],
    );
    let gains: Vec<&EventKind> = events
        .iter()
        .map(|e| &e.kind)
        .filter(|k| matches!(k, EventKind::MarkerGained { .. }))
        .collect();
    assert_eq!(
        gains,
        [&EventKind::MarkerGained {
            seat: Seat::P0,
            marker: Marker::Cross,
            from_opponent: false,
        }]
    );
    assert_eq!(
        state.player(Seat::P0).cross,
        before.player(Seat::P0).cross + 1
    );
    assert_eq!(state.supply.cross, before.supply.cross - 1);
    assert_eq!(state.player(Seat::P1).cross, before.player(Seat::P1).cross);
    for seat in [Seat::P0, Seat::P1] {
        let (now, then) = (state.player(seat), before.player(seat));
        assert_eq!(
            (now.health, now.fang, now.hourglass, now.potion),
            (then.health, then.fang, then.hourglass, then.potion)
        );
    }
    assert_conserved(&state);
}

#[test]
fn potion_eliminated_knight_gains_no_hourglass() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Seer, Witch, Villager],
        &[WolfKing, Knight, Wolfen],
        WolfBeauty,
    );
    apply_edit(
        &mut state,
        Edit::SetPotion {
            seat: Some(Seat::P0),
        },
    )
    .unwrap();
    submit(&mut state, Seat::P0, Villager, &[TargetCard::Fool]);
    submit(&mut state, Seat::P1, Knight, &[TargetCard::Fool]);
    apply(&mut state, Seat::P0, Command::PlaceHourglasses { n: 0 }).unwrap();
    apply(&mut state, Seat::P1, Command::PlaceHourglasses { n: 0 }).unwrap();
    let hourglasses = state.player(Seat::P1).hourglass;
    let events = apply(
        &mut state,
        Seat::P0,
        Command::ChoosePotionTarget { card: Knight },
    )
    .unwrap();
    assert!(kinds(&events).contains(&EventKind::PotionResolved {
        target: Knight,
        victim: Seat::P1,
        hit: true,
        health_lost: 1,
    }));
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert!(
        !kinds(&events)
            .iter()
            .any(|k| matches!(k, EventKind::MarkerGained { seat: Seat::P1, .. }))
    );
    assert_eq!(state.player(Seat::P1).hourglass, hourglasses);
    assert_conserved(&state);
}
