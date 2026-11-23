use wwd_core::{
    BadgeStart, Command, EventKind, Phase, Recorder, RulesConfig, Seat, Viewer, Visibility,
    events_since, legal_actions, pending, seed_commitment, verify,
};

const NEW_SEED: [u8; 32] = [9; 32];

/// A recorder at the end of round 1, before either seat has asked for the next round.
fn at_first_boundary() -> Recorder {
    let config = RulesConfig {
        badge_start: BadgeStart::Seat(Seat::P0),
        ..RulesConfig::default()
    };
    let mut rec = Recorder::new([5; 32], config);
    while rec.state().phase != Phase::RoundOver {
        let seat = pending(rec.state()).seats[0];
        let cmd = legal_actions(rec.state(), seat)[0].clone();
        rec.apply(seat, cmd).unwrap();
    }
    rec
}

#[test]
fn resume_emits_segment_started() {
    let rec = at_first_boundary();
    let boundary = rec.round_boundary().unwrap();
    let mut resumed = Recorder::resume(boundary.clone(), rec.replay().clone(), NEW_SEED).unwrap();

    let first = &resumed.state().log[0];
    assert_eq!(first.visibility, Visibility::Public);
    assert_eq!(
        first.kind,
        EventKind::SegmentStarted {
            round: boundary.round + 1,
            seed_commitment: seed_commitment(&NEW_SEED),
        }
    );
    assert_eq!(first.kind.id(), "event-segment-started");
    for viewer in [
        Viewer::Seat(Seat::P0),
        Viewer::Seat(Seat::P1),
        Viewer::Spectator,
    ] {
        let events = events_since(resumed.state(), 0, viewer);
        assert_eq!(events.first().map(|(seq, e)| (*seq, e)), Some((0, first)));
    }
    assert_eq!(verify(resumed.replay()), Ok(()));

    for seat in [Seat::P0, Seat::P1] {
        resumed.apply(seat, Command::NextRound).unwrap();
    }
    assert_eq!(resumed.state().round, boundary.round + 1);
    assert_eq!(verify(resumed.replay()), Ok(()));
}
