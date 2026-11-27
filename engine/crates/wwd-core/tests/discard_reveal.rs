#![cfg(all(feature = "unsafe-edit", feature = "fuzz"))]

mod common;

use common::scenario;
use wwd_core::Character::*;
use wwd_core::{
    BadgeStart, Command, ENGINE_VERSION, Event, EventKind, Phase, Recorder, Replay, ReplayError,
    RuleError, RulesConfig, Seat, State, TargetCard, Viewer, Visibility, apply, check_invariants,
    events_since, legal_actions, new_game, replay_timeline, verify, view,
};

const SEATS: [Seat; 2] = [Seat::P0, Seat::P1];

/// Whether either seat's view or events name `discard`.
fn seen_by_a_seat(state: &State, discard: &str) -> bool {
    SEATS.into_iter().any(|seat| {
        let viewer = Viewer::Seat(seat);
        let shown =
            serde_json::to_string(&(view(state, viewer), events_since(state, 0, viewer))).unwrap();
        shown.contains(discard)
    })
}

fn reveals(events: &[Event]) -> Vec<&Event> {
    events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::DiscardRevealed { .. }))
        .collect()
}

#[test]
fn discard_is_hidden_during_the_round_and_revealed_at_round_end() {
    let config = RulesConfig {
        badge_start: BadgeStart::Seat(Seat::P0),
        ..RulesConfig::default()
    };
    let mut state = new_game([6; 32], config);
    let discard = state.discard.expect("round 1 is dealt");
    let name = serde_json::to_string(&discard).unwrap();
    let plan = |seat: Seat| Command::SubmitPlan {
        character: state.player(seat).hand[0],
        targets: vec![TargetCard::Fool],
    };
    let commands = [
        (Seat::P0, plan(Seat::P0)),
        (Seat::P1, plan(Seat::P1)),
        (Seat::P0, Command::PlaceHourglasses { n: 0 }),
        (Seat::P1, Command::PlaceHourglasses { n: 0 }),
    ];
    let mut last = Vec::new();
    for (seat, cmd) in commands {
        assert!(!seen_by_a_seat(&state, &name), "before {cmd:?}");
        assert_eq!(check_invariants(&state), Ok(()));
        last = apply(&mut state, seat, cmd).unwrap();
    }

    assert_eq!(state.phase, Phase::RoundOver);
    let kinds: Vec<&EventKind> = last.iter().map(|e| &e.kind).collect();
    let ended = kinds
        .iter()
        .position(|k| matches!(k, EventKind::RoundEnded { .. }))
        .expect("the round ends");
    assert_eq!(
        last[ended + 1..],
        [Event {
            visibility: Visibility::Public,
            kind: EventKind::DiscardRevealed {
                round: 1,
                character: discard,
            },
        }]
    );
    for seat in SEATS {
        assert_eq!(view(&state, Viewer::Seat(seat)).discard, None);
    }
    assert!(seen_by_a_seat(&state, &name));
    assert_eq!(check_invariants(&state), Ok(()));
}

#[test]
fn a_game_that_ends_mid_round_reveals_nothing() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    );
    apply(&mut state, Seat::P0, Command::Resign).unwrap();
    assert!(matches!(state.phase, Phase::GameOver { .. }));
    assert!(reveals(&state.log).is_empty());
}

#[test]
fn every_round_end_reveals_that_rounds_discard() {
    let (replay, state) = wwd_core::random_game([8; 32], wwd_core::RulesConfig::default(), [9; 32]);
    let mut rec = Recorder::new(replay.segments[0].seed, replay.config);
    let mut revealed = 0;
    for entry in &replay.segments[0].entries {
        let wwd_core::ReplayEntry::Command { seat, cmd } = entry else {
            unreachable!("random games have no edits");
        };
        let discard = rec.state().discard;
        let events = rec.apply(*seat, cmd.clone()).unwrap();
        let ends = events
            .iter()
            .any(|e| matches!(e.kind, EventKind::RoundEnded { .. }));
        let shown = reveals(&events);
        if ends {
            let round = rec.state().round;
            let character = discard.expect("a dealt round has a discard");
            assert_eq!(
                shown,
                [&Event {
                    visibility: Visibility::Public,
                    kind: EventKind::DiscardRevealed { round, character },
                }]
            );
            revealed += 1;
        } else {
            assert!(shown.is_empty());
        }
    }
    assert_eq!(rec.state(), &state);
    assert!(revealed > 0);
}

fn old_replay() -> Replay {
    serde_json::from_str(include_str!("fixtures/replay-0.1.0.json")).unwrap()
}

/// Plays the first legal action of whoever can act until the round or the game ends.
fn play_round(rec: &mut Recorder) {
    if rec.state().phase == Phase::RoundOver {
        for seat in SEATS {
            rec.apply(seat, Command::NextRound).unwrap();
        }
    }
    while !matches!(rec.state().phase, Phase::RoundOver | Phase::GameOver { .. }) {
        let (seat, cmd) = SEATS
            .into_iter()
            .find_map(|s| {
                legal_actions(rec.state(), s)
                    .first()
                    .map(|c| (s, c.clone()))
            })
            .expect("someone can act");
        rec.apply(seat, cmd).unwrap();
    }
}

/// A two-round game resumed for a third round under a new seed, labelled as recorded by
/// engine 0.1.0, whose replays are re-simulated without comparing checkpoints.
fn relabelled_0_1_0() -> Replay {
    let mut rec = Recorder::new([3; 32], RulesConfig::default());
    play_round(&mut rec);
    play_round(&mut rec);
    let boundary = rec.round_boundary().expect("the game is still running");
    let mut rec = Recorder::resume(boundary, rec.replay().clone(), [4; 32]).unwrap();
    play_round(&mut rec);
    let mut old = rec.replay().clone();
    old.engine_version = "0.1.0".to_string();
    old
}

/// A replay labelled as engine 0.1.0, with a resumed segment, is re-simulated and upgraded.
#[test]
fn a_replay_labelled_0_1_0_still_verifies() {
    let old = relabelled_0_1_0();
    assert_ne!(ENGINE_VERSION, "0.1.0");
    assert_eq!(verify(&old), Ok(()));

    let steps = replay_timeline(&old, Viewer::Seat(Seat::P0)).unwrap();
    assert!(
        steps
            .iter()
            .flat_map(|s| &s.events)
            .any(|e| matches!(e.kind, EventKind::DiscardRevealed { .. }))
    );

    let rec = Recorder::from_replay(old.clone()).unwrap();
    assert_eq!(rec.replay().engine_version, ENGINE_VERSION);
    assert_eq!(verify(rec.replay()), Ok(()));
    assert_eq!(rec.replay().segments.len(), old.segments.len());
}

/// The saved 0.1.0 game targets a card in its player's own hand, which the rules now forbid.
#[test]
fn a_saved_0_1_0_replay_with_an_in_hand_target_no_longer_verifies() {
    let old = old_replay();
    assert_eq!(old.engine_version, "0.1.0");
    let expected = ReplayError::Rule {
        index: 1,
        err: RuleError::TargetInHand,
    };
    assert_eq!(verify(&old), Err(expected.clone()));
    assert_eq!(Recorder::from_replay(old).unwrap_err(), expected);
}

#[test]
fn a_tampered_old_replay_is_still_rejected() {
    let mut old = relabelled_0_1_0();
    old.segments[1].seed[0] ^= 1;
    assert_eq!(verify(&old), Err(ReplayError::CommitmentMismatch(1)));

    let mut unknown = relabelled_0_1_0();
    unknown.engine_version = "0.0.9".to_string();
    assert_eq!(
        verify(&unknown),
        Err(ReplayError::EngineVersion("0.0.9".to_string()))
    );
}
