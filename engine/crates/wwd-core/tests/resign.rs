#![cfg(feature = "unsafe-edit")]

mod common;

use common::scenario;
use wwd_core::Character::*;
use wwd_core::{
    Command, Edit, Event, EventKind, Phase, Recorder, RuleError, RulesConfig, Seat, State,
    TargetCard, Visibility, WinReason, apply, apply_edit, can_resign, legal_actions, verify,
};

fn c(character: wwd_core::Character) -> TargetCard {
    TargetCard::Character(character)
}

fn submit(state: &mut State, seat: Seat, character: wwd_core::Character, targets: &[TargetCard]) {
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

fn place(state: &mut State, seat: Seat, n: u8) {
    apply(state, seat, Command::PlaceHourglasses { n }).expect("placement should be accepted");
}

fn humans_vs_wolves() -> State {
    scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    )
}

fn plan_phase() -> State {
    humans_vs_wolves()
}

fn reveal_hourglass() -> State {
    let mut state = humans_vs_wolves();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]);
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);
    state
}

fn reveal_potion() -> State {
    let mut state = humans_vs_wolves();
    apply_edit(
        &mut state,
        Edit::SetPotion {
            seat: Some(Seat::P0),
        },
    )
    .unwrap();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]);
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);
    place(&mut state, Seat::P0, 0);
    place(&mut state, Seat::P1, 0);
    state
}

fn hunter_choice() -> State {
    let mut state = humans_vs_wolves();
    submit(&mut state, Seat::P0, Hunter, &[c(Wolfen), c(WolfBeauty)]);
    submit(&mut state, Seat::P1, WolfBeauty, &[c(Knight)]);
    place(&mut state, Seat::P0, 0);
    place(&mut state, Seat::P1, 0);
    state
}

fn round_over() -> State {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Villager],
        &[WolfKing, Wolfen, WolfBeauty],
        Witch,
    );
    submit(&mut state, Seat::P0, Villager, &[TargetCard::Fool]);
    submit(&mut state, Seat::P1, WolfBeauty, &[TargetCard::Fool]);
    place(&mut state, Seat::P0, 0);
    place(&mut state, Seat::P1, 1);
    state
}

fn assert_resigned(events: &[Event], resigner: Seat) {
    let winner = resigner.other();
    let reason = WinReason::Resignation;
    assert_eq!(
        events,
        [
            Event {
                visibility: Visibility::Public,
                kind: EventKind::Resigned { seat: resigner },
            },
            Event {
                visibility: Visibility::Public,
                kind: EventKind::GameOver { winner, reason },
            },
        ]
    );
}

#[test]
fn resign_ends_game_any_phase() {
    let cases: [(&str, State, Phase); 5] = [
        ("plan", plan_phase(), Phase::Plan),
        (
            "reveal hourglass",
            reveal_hourglass(),
            Phase::RevealHourglass { seat: Seat::P0 },
        ),
        (
            "reveal potion",
            reveal_potion(),
            Phase::RevealPotion { seat: Seat::P0 },
        ),
        (
            "hunter choice",
            hunter_choice(),
            Phase::HunterChoice { seat: Seat::P0 },
        ),
        ("round over", round_over(), Phase::RoundOver),
    ];
    for (name, state, phase) in cases {
        assert_eq!(state.phase, phase, "{name}");
        for resigner in [Seat::P0, Seat::P1] {
            let mut state = state.clone();
            assert!(can_resign(&state, resigner), "{name}");
            let before = state.log.len();
            let events = apply(&mut state, resigner, Command::Resign).unwrap();
            assert_resigned(&events, resigner);
            assert_eq!(
                state.phase,
                Phase::GameOver {
                    winner: resigner.other(),
                    reason: WinReason::Resignation,
                },
                "{name}"
            );
            assert_eq!(state.log.len(), before + 2, "{name}");
            assert!(!can_resign(&state, resigner), "{name}");
        }
    }
}

#[test]
fn resign_not_in_legal_actions() {
    for state in [
        plan_phase(),
        reveal_hourglass(),
        reveal_potion(),
        hunter_choice(),
        round_over(),
    ] {
        for seat in [Seat::P0, Seat::P1] {
            assert!(!legal_actions(&state, seat).contains(&Command::Resign));
        }
    }
}

#[test]
fn resign_after_game_over_rejected() {
    let mut state = plan_phase();
    apply(&mut state, Seat::P0, Command::Resign).unwrap();
    let logged = state.log.len();
    for seat in [Seat::P0, Seat::P1] {
        assert_eq!(
            apply(&mut state, seat, Command::Resign),
            Err(RuleError::GameOver)
        );
    }
    assert_eq!(state.log.len(), logged);
}

#[test]
fn replay_with_resign_verifies() {
    let mut rec = Recorder::new([5; 32], RulesConfig::default());
    let seat = [Seat::P0, Seat::P1]
        .into_iter()
        .find(|&s| !legal_actions(rec.state(), s).is_empty())
        .unwrap();
    let cmd = legal_actions(rec.state(), seat)[0].clone();
    rec.apply(seat, cmd).unwrap();
    rec.apply(Seat::P1, Command::Resign).unwrap();
    assert!(matches!(
        rec.state().phase,
        Phase::GameOver {
            winner: Seat::P0,
            reason: WinReason::Resignation
        }
    ));
    verify(rec.replay()).unwrap();
}
