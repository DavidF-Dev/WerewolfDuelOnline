mod common;

use wwd_core::{
    BadgeStart, Character, Command, Phase, Recorder, Replay, ReplayEntry, ReplayError, RngState,
    RoundBoundary, RulesConfig, Seat, SegmentStart, hash_bytes, legal_actions, replay, verify,
};

const SEATS: [Seat; 2] = [Seat::P0, Seat::P1];

fn config() -> RulesConfig {
    RulesConfig {
        badge_start: BadgeStart::Seat(Seat::P0),
        ..RulesConfig::default()
    }
}

/// Plays the first legal action for whoever can act, starting the next round if the game
/// is at round over, until the round ends or the game does.
fn play_round(rec: &mut Recorder) {
    if rec.state().phase == Phase::RoundOver {
        for seat in SEATS {
            rec.apply(seat, Command::NextRound).expect("next round");
        }
    }
    while !matches!(rec.state().phase, Phase::RoundOver | Phase::GameOver { .. }) {
        let (seat, cmd) = SEATS
            .into_iter()
            .find_map(|s| {
                legal_actions(rec.state(), s)
                    .into_iter()
                    .next()
                    .map(|c| (s, c))
            })
            .expect("someone can act");
        rec.apply(seat, cmd).expect("legal action");
    }
}

/// A recorder that has completed `rounds` rounds and is at round over.
fn played(seed: u8, rounds: u32) -> Recorder {
    let mut rec = Recorder::new([seed; 32], config());
    for _ in 0..rounds {
        play_round(&mut rec);
    }
    assert_eq!(
        rec.state().phase,
        Phase::RoundOver,
        "the scripted game must still be running"
    );
    rec
}

#[test]
fn replay_reproduces_final_hash() {
    let rec = played(5, 3);
    assert_eq!(rec.state().round, 3);
    let replayed = replay(rec.replay()).unwrap();
    assert_eq!(hash_bytes(&replayed), hash_bytes(rec.state()));
    assert_eq!(verify(rec.replay()), Ok(()));
    assert_eq!(rec.replay().segments[0].checkpoints.len(), 3);
}

#[test]
fn checkpoint_indices_follow_round_ends() {
    let rec = played(5, 2);
    let segment = &rec.replay().segments[0];
    let last = u32::try_from(segment.entries.len() - 1).unwrap();
    assert_eq!(segment.checkpoints.last().unwrap().index, last);
    assert!(segment.checkpoints[0].index < last);
}

#[test]
fn rejected_commands_are_not_recorded() {
    let mut rec = Recorder::new([5; 32], config());
    assert!(
        rec.apply(Seat::P0, Command::PlaceHourglasses { n: 1 })
            .is_err()
    );
    assert!(rec.replay().segments[0].entries.is_empty());
}

#[test]
fn tampered_command_fails_verify() {
    let rec = played(5, 3);
    let mut tampered = rec.replay().clone();
    let entry = tampered.segments[0]
        .entries
        .iter_mut()
        .find(|e| {
            matches!(
                e,
                ReplayEntry::Command {
                    cmd: Command::PlaceHourglasses { n: 0 },
                    ..
                }
            )
        })
        .expect("the script places hourglasses with n = 0");
    if let ReplayEntry::Command { cmd, .. } = entry {
        *cmd = Command::PlaceHourglasses { n: 1 };
    }
    assert!(matches!(
        verify(&tampered),
        Err(ReplayError::CheckpointMismatch { .. } | ReplayError::Rule { .. })
    ));
}

#[test]
fn bad_commitment_fails_verify() {
    let mut bad = played(5, 1).replay().clone();
    bad.segments[0].seed_commitment = [0; 32];
    assert_eq!(verify(&bad), Err(ReplayError::CommitmentMismatch(0)));
}

#[test]
fn tampered_checkpoint_fails_verify() {
    let mut bad = played(5, 1).replay().clone();
    bad.segments[0].checkpoints[0].hash = [1; 32];
    assert!(matches!(
        verify(&bad),
        Err(ReplayError::CheckpointMismatch { segment: 0, .. })
    ));
}

#[test]
fn version_mismatches_are_rejected() {
    let mut bad = played(5, 1).replay().clone();
    bad.format_version = 2;
    assert_eq!(verify(&bad), Err(ReplayError::FormatVersion(2)));

    let mut bad = played(5, 1).replay().clone();
    bad.engine_version = "0.0.0-other".to_string();
    assert_eq!(
        replay(&bad).unwrap_err(),
        ReplayError::EngineVersion("0.0.0-other".to_string())
    );
}

#[test]
fn round_boundary_only_at_round_over_before_anyone_is_ready() {
    let mut rec = played(5, 1);
    assert_eq!(rec.round_boundary().map(|b| b.round), Some(1));
    rec.apply(Seat::P1, Command::NextRound).unwrap();
    assert!(rec.round_boundary().is_none());
    rec.apply(Seat::P0, Command::NextRound).unwrap();
    assert_eq!(rec.state().phase, Phase::Plan);
    assert!(rec.round_boundary().is_none());
    assert!(Recorder::new([5; 32], config()).round_boundary().is_none());
}

#[test]
fn resume_from_boundary_makes_new_segment() {
    let rec = played(5, 2);
    let boundary = rec.round_boundary().expect("between rounds");
    assert_eq!(boundary.round, 2);

    let resumed = Recorder::resume(boundary.clone(), rec.replay().clone(), [9; 32]).unwrap();
    assert_eq!(resumed.replay().segments.len(), 2);
    assert!(matches!(
        resumed.replay().segments[1].start,
        SegmentStart::RoundBoundary(_)
    ));
    assert_eq!(resumed.replay().segments[1].seed, [9; 32]);

    let state = resumed.state();
    assert_eq!(state.round, boundary.round);
    assert_eq!(state.badge, boundary.badge);
    assert_eq!(state.phase, Phase::RoundOver);
    assert!(
        state
            .players
            .iter()
            .all(|p| p.hand.is_empty() && p.plan.is_none())
    );
    assert_eq!(state.discard, None);
    for (player, expected) in state.players.iter().zip(&boundary.players) {
        assert_eq!(
            (
                player.health,
                player.cross,
                player.fang,
                player.hourglass,
                player.potion
            ),
            (
                expected.health,
                expected.cross,
                expected.fang,
                expected.hourglass,
                expected.potion
            )
        );
    }
    assert_eq!(state.supply, boundary.supply);
    common::assert_conserved(state);
    assert_eq!(verify(resumed.replay()), Ok(()));

    let mut resumed = resumed;
    play_round(&mut resumed);
    assert_eq!(resumed.state().round, 3);
    assert_eq!(verify(resumed.replay()), Ok(()));
    let replayed = replay(resumed.replay()).unwrap();
    assert_eq!(hash_bytes(&replayed), hash_bytes(resumed.state()));
}

#[test]
fn json_roundtrip() {
    let rec = played(5, 2);
    let resumed =
        Recorder::resume(rec.round_boundary().unwrap(), rec.replay().clone(), [9; 32]).unwrap();
    let original = resumed.replay();
    let json = serde_json::to_string(original).unwrap();
    let back: Replay = serde_json::from_str(&json).unwrap();
    assert_eq!(&back, original);
    assert_eq!(verify(&back), Ok(()));
}

#[cfg(feature = "unsafe-edit")]
#[test]
fn edits_are_recorded_taint_and_replay() {
    use wwd_core::Edit;

    let mut rec = played(5, 1);
    rec.apply_edit(Edit::SetHealth {
        seat: Seat::P0,
        n: 1,
    })
    .unwrap();
    assert!(rec.replay().tainted);
    play_round(&mut rec);
    assert_eq!(verify(rec.replay()), Ok(()));
    let replayed = replay(rec.replay()).unwrap();
    assert_eq!(hash_bytes(&replayed), hash_bytes(rec.state()));
}

#[cfg(not(feature = "unsafe-edit"))]
#[test]
fn edits_unsupported_without_feature() {
    use wwd_core::Edit;

    let mut bad = played(5, 1).replay().clone();
    bad.segments[0]
        .entries
        .push(ReplayEntry::Edit(Edit::SetBadge { seat: Seat::P1 }));
    assert_eq!(replay(&bad).unwrap_err(), ReplayError::EditsUnsupported);
    assert_eq!(verify(&bad), Err(ReplayError::EditsUnsupported));
}

fn resumed_replay() -> Replay {
    let rec = played(5, 2);
    Recorder::resume(rec.round_boundary().unwrap(), rec.replay().clone(), [9; 32])
        .unwrap()
        .replay()
        .clone()
}

fn boundary_mut(replay: &mut Replay) -> &mut RoundBoundary {
    match &mut replay.segments[1].start {
        SegmentStart::RoundBoundary(b) => b,
        SegmentStart::Setup => unreachable!(),
    }
}

#[test]
fn forged_boundary_fails_continuity() {
    let mut forged = resumed_replay();
    boundary_mut(&mut forged).players[0].health = 1;
    assert_eq!(verify(&forged), Err(ReplayError::SegmentDiscontinuity(1)));
    assert_eq!(replay(&forged), Err(ReplayError::SegmentDiscontinuity(1)));
}

#[test]
fn resume_rejects_boundary_that_does_not_match_prior() {
    let rec = played(5, 2);
    let mut boundary = rec.round_boundary().unwrap();
    boundary.players[0].health = 1;
    assert_eq!(
        Recorder::resume(boundary, rec.replay().clone(), [9; 32]).unwrap_err(),
        ReplayError::SegmentDiscontinuity(1)
    );
}

#[test]
fn invalid_boundaries_are_rejected() {
    let rec = played(5, 2);
    let valid = rec.round_boundary().unwrap();
    let cases: Vec<RoundBoundary> = vec![
        RoundBoundary {
            round: 0,
            ..valid.clone()
        },
        {
            let mut b = valid.clone();
            b.players[0].cross += 1;
            b
        },
        {
            let mut b = valid.clone();
            b.supply.potion = !b.supply.potion;
            b
        },
        {
            let mut b = valid.clone();
            b.players[1].health = 0;
            b
        },
    ];
    for boundary in cases {
        assert_eq!(
            Recorder::resume(boundary.clone(), rec.replay().clone(), [9; 32]).unwrap_err(),
            ReplayError::InvalidBoundary
        );
        let mut forged = resumed_replay();
        *boundary_mut(&mut forged) = boundary;
        assert_eq!(verify(&forged), Err(ReplayError::InvalidBoundary));
    }
}

#[test]
fn won_boundary_is_invalid() {
    let rec = played(5, 2);
    let mut boundary = rec.round_boundary().unwrap();
    // Move crosses from the supply so totals still balance.
    let moved = 4 - boundary.players[0].cross;
    boundary.players[0].cross = 4;
    boundary.supply.cross -= moved;
    assert_eq!(
        Recorder::resume(boundary, rec.replay().clone(), [9; 32]).unwrap_err(),
        ReplayError::InvalidBoundary
    );
}

#[cfg(feature = "unsafe-edit")]
#[test]
fn unflagged_edit_fails_verify_and_taint_carries_across_resume() {
    use wwd_core::Edit;

    let mut rec = played(5, 1);
    rec.apply_edit(Edit::SetHealth {
        seat: Seat::P0,
        n: 1,
    })
    .unwrap();
    let mut hidden = rec.replay().clone();
    hidden.tainted = false;
    assert_eq!(verify(&hidden), Err(ReplayError::TaintMismatch));

    play_round(&mut rec);
    let resumed =
        Recorder::resume(rec.round_boundary().unwrap(), rec.replay().clone(), [9; 32]).unwrap();
    assert!(resumed.state().tainted);
    assert_eq!(verify(resumed.replay()), Ok(()));
    let replayed = replay(resumed.replay()).unwrap();
    assert_eq!(hash_bytes(&replayed), hash_bytes(resumed.state()));
}

#[test]
fn boundary_cannot_start_segment_zero() {
    let valid = played(5, 2).round_boundary().unwrap();
    let mut forged = played(5, 2).replay().clone();
    forged.segments[0].start = SegmentStart::RoundBoundary(RoundBoundary {
        round: u32::MAX,
        ..valid
    });
    assert_eq!(replay(&forged), Err(ReplayError::SegmentDiscontinuity(0)));
    assert_eq!(verify(&forged), Err(ReplayError::SegmentDiscontinuity(0)));
}

#[test]
fn boundary_health_above_start_is_invalid() {
    let rec = played(5, 2);
    let mut boundary = rec.round_boundary().unwrap();
    boundary.players[0].health = 3;
    assert_eq!(
        Recorder::resume(boundary, rec.replay().clone(), [9; 32]).unwrap_err(),
        ReplayError::InvalidBoundary
    );
}

#[test]
fn resumed_boundary_deals_from_the_new_seed() {
    let rec = played(5, 2);
    let mut resumed =
        Recorder::resume(rec.round_boundary().unwrap(), rec.replay().clone(), [9; 32]).unwrap();
    let mut original = rec;
    for seat in SEATS {
        original.apply(seat, Command::NextRound).unwrap();
        resumed.apply(seat, Command::NextRound).unwrap();
    }
    assert_eq!(resumed.state().round, 3);
    assert_eq!(original.state().round, 3);

    let mut deck = Character::ALL;
    RngState::new([9; 32]).shuffle(&mut deck);
    assert_eq!(resumed.state().discard, Some(deck[0]));
    let deal = |r: &Recorder| {
        let state = r.state();
        (
            state.players.each_ref().map(|p| p.hand.clone()),
            state.discard,
        )
    };
    assert_ne!(deal(&resumed), deal(&original));
    assert_eq!(verify(resumed.replay()), Ok(()));
}

#[test]
fn recorder_json_roundtrip_continues_play() {
    let rec = played(5, 2);
    let json = serde_json::to_string(&rec).unwrap();
    let replay_json = serde_json::to_string(rec.replay()).unwrap();
    assert_eq!(json, replay_json, "a recorder is stored as its replay");

    let mut back: Recorder = serde_json::from_str(&json).unwrap();
    assert_eq!(back.state(), rec.state());
    assert_eq!(back.replay(), rec.replay());
    let mut original = rec;
    play_round(&mut original);
    play_round(&mut back);
    assert_eq!(hash_bytes(back.state()), hash_bytes(original.state()));
    assert_eq!(verify(back.replay()), Ok(()));
}

#[test]
fn from_replay_rejects_a_tampered_replay() {
    let rec = played(5, 2);
    let rebuilt = Recorder::from_replay(rec.replay().clone()).unwrap();
    assert_eq!(rebuilt.state(), rec.state());

    let mut tampered = rec.replay().clone();
    tampered.segments[0].checkpoints[0].hash = [1; 32];
    assert!(matches!(
        Recorder::from_replay(tampered.clone()),
        Err(ReplayError::CheckpointMismatch { .. })
    ));
    let json = serde_json::to_string(&tampered).unwrap();
    assert!(serde_json::from_str::<Recorder>(&json).is_err());
}

#[test]
fn resume_verifies_the_prior_replay() {
    let rec = played(5, 2);
    let boundary = rec.round_boundary().unwrap();
    let mut tampered = rec.replay().clone();
    tampered.segments[0].seed_commitment = [0; 32];
    assert_eq!(
        Recorder::resume(boundary, tampered, [9; 32]).unwrap_err(),
        ReplayError::CommitmentMismatch(0)
    );
}

#[cfg(feature = "unsafe-edit")]
#[test]
fn edits_that_would_end_the_game_are_rejected() {
    use wwd_core::{Edit, EditError, apply_edit};

    let rec = played(5, 1);
    for edit in [
        Edit::SetHealth {
            seat: Seat::P0,
            n: 0,
        },
        Edit::SetCross {
            seat: Seat::P1,
            n: 4,
        },
        Edit::SetFang {
            seat: Seat::P0,
            n: 3,
        },
    ] {
        let mut state = rec.state().clone();
        assert_eq!(
            apply_edit(&mut state, edit.clone()),
            Err(EditError::WouldEndGame)
        );
        assert_eq!(&state, rec.state());
    }
}

#[cfg(feature = "unsafe-edit")]
#[test]
fn crafted_supply_exhausting_replay_fails_cleanly() {
    use wwd_core::{Edit, EditError};

    let mut crafted = played(5, 1).replay().clone();
    crafted.tainted = true;
    let entries = &mut crafted.segments[0].entries;
    let first = u32::try_from(entries.len()).unwrap();
    entries.push(ReplayEntry::Edit(Edit::SetCross {
        seat: Seat::P0,
        n: 3,
    }));
    entries.push(ReplayEntry::Edit(Edit::SetCross {
        seat: Seat::P1,
        n: 4,
    }));
    let expected = ReplayError::Edit {
        index: first + 1,
        err: EditError::WouldEndGame,
    };
    assert_eq!(verify(&crafted), Err(expected.clone()));
    assert_eq!(replay(&crafted).unwrap_err(), expected.clone());
    assert_eq!(Recorder::from_replay(crafted).unwrap_err(), expected);
}
