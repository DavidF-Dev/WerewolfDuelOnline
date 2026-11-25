#![cfg(all(feature = "unsafe-edit", feature = "fuzz"))]

mod common;

use common::scenario;
use wwd_core::Character::*;
use wwd_core::{
    Command, EventKind, Phase, Recorder, RulesConfig, Seat, State, TargetCard, apply, random_game,
};

fn hit_events(state: &State) -> Vec<EventKind> {
    state
        .log
        .iter()
        .filter(|e| matches!(e.kind, EventKind::AttackHit { .. }))
        .map(|e| e.kind.clone())
        .collect()
}

#[test]
fn attack_hit_names_the_attacker_and_the_victim() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    );
    let plans = [
        (Seat::P0, Knight, TargetCard::Character(Wolfen)),
        (Seat::P1, Wolfen, TargetCard::Character(Knight)),
    ];
    for (seat, character, target) in plans {
        apply(
            &mut state,
            seat,
            Command::SubmitPlan {
                character,
                targets: vec![target],
            },
        )
        .unwrap();
    }
    for seat in [Seat::P0, Seat::P1] {
        apply(&mut state, seat, Command::PlaceHourglasses { n: 0 }).unwrap();
    }
    assert_eq!(
        hit_events(&state),
        [EventKind::AttackHit {
            seat: Seat::P0,
            target_seat: Seat::P1,
            attacker: Knight,
            character: Wolfen,
            health_lost: 1,
        }]
    );
}

/// In random games, every hit names the attacking seat's played character as the attacker
/// and the target seat's played character as the one hit.
#[test]
fn every_hit_names_both_played_characters() {
    let mut hits = 0;
    for game in 0..40u8 {
        let (replay, _) = random_game([game; 32], RulesConfig::default(), [game ^ 0x5a; 32]);
        let mut rec = Recorder::new(replay.segments[0].seed, replay.config);
        for entry in &replay.segments[0].entries {
            let wwd_core::ReplayEntry::Command { seat, cmd } = entry else {
                unreachable!("random games have no edits");
            };
            let events = rec.apply(*seat, cmd.clone()).unwrap();
            let played = |seat: Seat| rec.state().player(seat).plan.as_ref().map(|p| p.character);
            for event in events {
                if let EventKind::AttackHit {
                    seat,
                    target_seat,
                    attacker,
                    character,
                    ..
                } = event.kind
                {
                    hits += 1;
                    assert_eq!(target_seat, seat.other());
                    assert_eq!(played(seat), Some(attacker));
                    assert_eq!(played(target_seat), Some(character));
                }
            }
        }
        assert!(matches!(rec.state().phase, Phase::GameOver { .. }));
    }
    assert!(hits > 0, "the seeds must produce at least one hit");
}
