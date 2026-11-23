mod common;

use common::scenario;
use wwd_core::{
    Character, Command, Edit, EventKind, Phase, Recorder, Replay, ReplayEntry, RngState,
    RulesConfig, Seat, SegmentStart, State, Viewer, apply, apply_edit, check_timeline_step,
    content_hash, effective_initiative, events_since, legal_actions, new_game, pending,
    random_game, replay, replay_timeline, resolution_order, showdown_order, view,
};

const SEATS: [Seat; 2] = [Seat::P0, Seat::P1];
const VIEWERS: [Viewer; 4] = [
    Viewer::Seat(Seat::P0),
    Viewer::Seat(Seat::P1),
    Viewer::Spectator,
    Viewer::Omniscient,
];

fn seed(index: u32, label: u8) -> [u8; 32] {
    let mut seed = [label; 32];
    seed[..4].copy_from_slice(&index.to_le_bytes());
    seed
}

/// The effective initiatives the reveal reports when P0 plays `character` with `placed`
/// Hourglasses and P1 places none.
fn revealed_effective(character: Character, placed: u8) -> [u8; 2] {
    let rest: Vec<Character> = Character::ALL
        .into_iter()
        .filter(|&c| c != character)
        .collect();
    let mut p0 = vec![character];
    p0.extend(&rest[..3]);
    let mut state = scenario(Seat::P0, &p0, &rest[3..6], rest[6]);
    apply_edit(
        &mut state,
        Edit::SetHourglass {
            seat: Seat::P0,
            n: 2,
        },
    )
    .unwrap();
    for seat in SEATS {
        let plan = legal_actions(&state, seat)
            .into_iter()
            .find(|cmd| match cmd {
                Command::SubmitPlan { character: c, .. } => seat == Seat::P1 || *c == character,
                _ => false,
            })
            .expect("a legal plan");
        apply(&mut state, seat, plan).unwrap();
    }
    apply(
        &mut state,
        Seat::P0,
        Command::PlaceHourglasses { n: placed },
    )
    .unwrap();
    let events = apply(&mut state, Seat::P1, Command::PlaceHourglasses { n: 0 }).unwrap();
    events
        .into_iter()
        .find_map(|e| match e.kind {
            EventKind::PlansRevealed { effective, .. } => Some(effective),
            _ => None,
        })
        .expect("plans are revealed once both seats have placed")
}

#[test]
fn effective_initiative_matches_resolution() {
    for character in Character::ALL {
        for placed in 0..=2 {
            assert_eq!(
                revealed_effective(character, placed)[0],
                effective_initiative(character, placed),
                "{character:?} with {placed} placed"
            );
        }
    }
    assert_eq!(effective_initiative(Character::Hunter, 2), 0);
    assert_eq!(effective_initiative(Character::Villager, 2), 6);
}

#[test]
fn showdown_order_agrees_with_state() {
    let mut round_over_compared = 0;
    for index in 0..200 {
        let (recorded, _) = random_game(seed(index, 1), RulesConfig::default(), seed(index, 2));
        let segment = &recorded.segments[0];
        let mut state = new_game(segment.seed, recorded.config);
        for entry in &segment.entries {
            let ReplayEntry::Command { seat, cmd } = entry else {
                panic!("fuzzed games hold no edits");
            };
            apply(&mut state, *seat, cmd.clone()).unwrap();
            let used = revealed_order(&state);
            if matches!(state.phase, Phase::HunterChoice { .. }) {
                assert_eq!(used, Some(resolution_order(&state)), "game {index}");
            }
            for viewer in VIEWERS {
                let order = showdown_order(&view(&state, viewer));
                assert_eq!(order, used, "game {index}, {viewer:?}");
                if used.is_some() && state.phase == Phase::RoundOver {
                    round_over_compared += 1;
                }
            }
        }
    }
    assert!(round_over_compared > 0);
}

/// The order carried by this round's `PlansRevealed`, if the plans are revealed.
fn revealed_order(state: &State) -> Option<[Seat; 2]> {
    let round_start = state
        .log
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::RoundStarted { .. }))
        .unwrap_or(0);
    state.log[round_start..].iter().find_map(|e| match e.kind {
        EventKind::PlansRevealed { order, .. } => Some(order),
        _ => None,
    })
}

/// Plays uniformly random legal actions until `stop` holds or the game ends.
fn play_until(rec: &mut Recorder, chooser: &mut RngState, stop: impl Fn(&State) -> bool) {
    while !stop(rec.state()) && !matches!(rec.state().phase, Phase::GameOver { .. }) {
        let seat = pending(rec.state()).seats[0];
        let mut actions = legal_actions(rec.state(), seat);
        let len = u32::try_from(actions.len()).unwrap();
        let cmd = actions.swap_remove(chooser.below(len) as usize);
        rec.apply(seat, cmd).unwrap();
    }
}

/// A random game paused after its first round and resumed under a new seed, played to
/// the end; `None` if the first round ends the game.
fn two_segment_game(index: u32) -> Option<Replay> {
    let mut chooser = RngState::new(seed(index, 3));
    let mut rec = Recorder::new(seed(index, 4), RulesConfig::default());
    play_until(&mut rec, &mut chooser, |s| s.phase == Phase::RoundOver);
    let boundary = rec.round_boundary()?;
    let mut rec = Recorder::resume(boundary, rec.replay().clone(), seed(index, 5)).unwrap();
    play_until(&mut rec, &mut chooser, |_| false);
    Some(rec.replay().clone())
}

/// The true state after each step of `r`, with the entry that step applied: the start of
/// every segment, then each of its entries.
fn states_by_step(r: &Replay) -> Vec<(State, Option<&ReplayEntry>)> {
    let mut states = Vec::new();
    for (index, segment) in r.segments.iter().enumerate() {
        let mut state = match &segment.start {
            SegmentStart::Setup => new_game(segment.seed, r.config),
            SegmentStart::RoundBoundary(boundary) => {
                let mut prior = r.clone();
                prior.segments.truncate(index);
                Recorder::resume(boundary.clone(), prior, segment.seed)
                    .unwrap()
                    .state()
                    .clone()
            }
        };
        states.push((state.clone(), None));
        for entry in &segment.entries {
            let ReplayEntry::Command { seat, cmd } = entry else {
                panic!("fuzzed games hold no edits");
            };
            apply(&mut state, *seat, cmd.clone()).unwrap();
            states.push((state.clone(), Some(entry)));
        }
    }
    states
}

#[test]
fn timeline_covers_every_command() {
    let games: Vec<Replay> = (0..20).filter_map(two_segment_game).collect();
    assert!(games.len() >= 10);
    for r in &games {
        assert_eq!(r.segments.len(), 2);
        let commands: usize = r.segments.iter().map(|s| s.entries.len()).sum();
        let states = states_by_step(r);
        for viewer in VIEWERS {
            let steps = replay_timeline(r, viewer).unwrap();
            assert_eq!(steps.len(), 1 + commands + (r.segments.len() - 1));
            assert_eq!(steps.len(), states.len());
            assert_eq!(
                steps.last().unwrap().view,
                view(&replay(r).unwrap(), viewer)
            );

            for (i, (step, (state, entry))) in steps.iter().zip(&states).enumerate() {
                assert_eq!(step.index as usize, i);
                assert_eq!(step.view, view(state, viewer));
                check_timeline_step(state, viewer, step)
                    .unwrap_or_else(|err| panic!("step {i}: {err}"));
                match entry {
                    None => assert_eq!((step.seat, &step.command), (None, &None)),
                    Some(ReplayEntry::Command { seat, cmd }) => {
                        let sees = viewer == Viewer::Omniscient || viewer == Viewer::Seat(*seat);
                        assert_eq!(step.seat, Some(*seat));
                        assert_eq!(step.command.as_ref(), sees.then_some(cmd));
                    }
                    Some(ReplayEntry::Edit(_)) => unreachable!(),
                }
            }

            let second = 1 + r.segments[0].entries.len();
            assert_eq!(steps[second].events.len(), 1);
            assert!(matches!(
                steps[second].events[0].kind,
                EventKind::SegmentStarted { .. }
            ));
            let (before, after) = steps.split_at(second);
            let ends = [&states[second - 1].0, &states.last().unwrap().0];
            for (segment_steps, end) in [before, after].into_iter().zip(ends) {
                let shown: Vec<_> = segment_steps
                    .iter()
                    .flat_map(|s| s.events.clone())
                    .collect();
                let logged: Vec<_> = events_since(end, 0, viewer)
                    .into_iter()
                    .map(|(_, e)| e)
                    .collect();
                assert_eq!(shown, logged, "{viewer:?}");
            }
        }
    }
}

#[test]
fn content_hash_is_blake3_of_the_text() {
    assert_eq!(
        content_hash(""),
        hex_bytes("af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262")
    );
    assert_eq!(
        content_hash("abc"),
        hex_bytes("6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85")
    );
}

fn hex_bytes(text: &str) -> [u8; 32] {
    let mut bytes = [0; 32];
    for (byte, pair) in bytes.iter_mut().zip(text.as_bytes().chunks(2)) {
        *byte = u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap();
    }
    bytes
}
