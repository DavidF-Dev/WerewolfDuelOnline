//! Random self-play with invariant checking, used by the tests and the CLI.

use std::collections::BTreeMap;

use crate::{
    BADGE_HAND_SIZE, Event, EventKind, OTHER_HAND_SIZE, Phase, PlanView, Recorder, Replay,
    RngState, RulesConfig, START_HEALTH, Seat, State, TOTAL_CROSS, TOTAL_FANG, TOTAL_HOURGLASS,
    View, Viewer, Visibility, WinReason, events_since, legal_actions, pending, verify, view,
};

const MAX_ROUNDS: u32 = 200;

/// Aggregate results of a fuzzing run.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FuzzReport {
    pub games: u32,
    pub rounds: u64,
    pub wins: [u32; 2],
    /// Game counts keyed by `"health"`, `"fangs"` or `"crosses"`.
    pub by_reason: BTreeMap<String, u32>,
}

/// Plays one game to its end, choosing uniformly among the legal actions of the seat
/// that must act. The chooser has its own random stream, separate from the game's.
///
/// # Panics
/// Panics if an invariant is violated, a player regains Health, the game exceeds 200
/// rounds, or no legal action exists while a seat is pending.
pub fn random_game(seed: [u8; 32], config: RulesConfig, chooser_seed: [u8; 32]) -> (Replay, State) {
    play(seed, config, chooser_seed).unwrap_or_else(|err| panic!("fuzz game failed: {err}"))
}

fn play(
    seed: [u8; 32],
    config: RulesConfig,
    chooser_seed: [u8; 32],
) -> Result<(Replay, State), String> {
    let mut recorder = Recorder::new(seed, config);
    let mut chooser = RngState::new(chooser_seed);
    check_invariants(recorder.state())?;
    while !matches!(recorder.state().phase, Phase::GameOver { .. }) {
        let state = recorder.state();
        if state.round > MAX_ROUNDS {
            return Err(format!("game exceeded {MAX_ROUNDS} rounds"));
        }
        let seat = *pending(state)
            .seats
            .first()
            .ok_or("no seat is pending before game over")?;
        let mut actions = legal_actions(state, seat);
        if actions.is_empty() {
            return Err(format!("no legal action for pending seat {seat:?}"));
        }
        let len = u32::try_from(actions.len()).map_err(|_| "too many legal actions")?;
        let cmd = actions.swap_remove(chooser.below(len) as usize);
        let health_before = state.players.each_ref().map(|p| p.health);
        recorder
            .apply(seat, cmd.clone())
            .map_err(|err| format!("legal action {cmd:?} rejected: {err}"))?;
        check_invariants(recorder.state())?;
        let health_after = recorder.state().players.each_ref().map(|p| p.health);
        if health_after
            .iter()
            .zip(health_before)
            .any(|(&after, before)| after > before)
        {
            return Err(format!(
                "health rose from {health_before:?} to {health_after:?}"
            ));
        }
    }
    Ok((recorder.replay().clone(), recorder.state().clone()))
}

/// Checks marker conservation, health bounds, hand sizes, phase and pending
/// consistency, and the redaction of every viewer's view. Returns the first violation.
pub fn check_invariants(state: &State) -> Result<(), String> {
    check_markers(state)?;
    check_hands(state)?;
    check_pending(state)?;
    check_views(state)
}

fn check_markers(state: &State) -> Result<(), String> {
    let [a, b] = &state.players;
    let crosses = state.supply.cross + a.cross + b.cross;
    if crosses != TOTAL_CROSS {
        return Err(format!("crosses total {crosses}"));
    }
    let fangs = state.supply.fang + a.fang + b.fang;
    if fangs != TOTAL_FANG {
        return Err(format!("fangs total {fangs}"));
    }
    let hourglasses = state.supply.hourglass + a.hourglass + a.placed + b.hourglass + b.placed;
    if hourglasses != TOTAL_HOURGLASS {
        return Err(format!("hourglasses total {hourglasses}"));
    }
    let holders = [state.supply.potion, a.potion, b.potion]
        .into_iter()
        .filter(|&held| held)
        .count();
    if holders != 1 {
        return Err(format!("{holders} potion holders"));
    }
    for seat in [Seat::P0, Seat::P1] {
        let health = state.player(seat).health;
        if health > START_HEALTH {
            return Err(format!("{seat:?} health {health} exceeds {START_HEALTH}"));
        }
    }
    Ok(())
}

fn check_hands(state: &State) -> Result<(), String> {
    for seat in [Seat::P0, Seat::P1] {
        let size = state.player(seat).hand.len();
        let expected = match state.phase {
            Phase::Plan if seat == state.badge => BADGE_HAND_SIZE,
            Phase::Plan => OTHER_HAND_SIZE,
            _ => 0,
        };
        if size != expected {
            return Err(format!(
                "{seat:?} holds {size} cards, expected {expected} in {:?}",
                state.phase
            ));
        }
    }
    Ok(())
}

fn check_pending(state: &State) -> Result<(), String> {
    let seats = pending(state).seats;
    let expected: Vec<Seat> = match state.phase {
        Phase::Plan => [Seat::P0, Seat::P1]
            .into_iter()
            .filter(|&s| state.player(s).plan.is_none())
            .collect(),
        Phase::RoundOver => [Seat::P0, Seat::P1]
            .into_iter()
            .filter(|&s| !state.next_round_ready[s.index()])
            .collect(),
        Phase::RevealHourglass { seat }
        | Phase::RevealPotion { seat }
        | Phase::HunterChoice { seat } => vec![seat],
        Phase::GameOver { .. } => Vec::new(),
    };
    if seats != expected {
        return Err(format!(
            "pending {seats:?} disagrees with phase {:?}",
            state.phase
        ));
    }
    if matches!(state.phase, Phase::Plan | Phase::RoundOver) && seats.is_empty() {
        return Err(format!("{:?} with no seat pending", state.phase));
    }
    for seat in [Seat::P0, Seat::P1] {
        let acts = !legal_actions(state, seat).is_empty();
        if acts != seats.contains(&seat) {
            return Err(format!("legal actions for {seat:?} disagree with pending"));
        }
    }
    Ok(())
}

fn round_start(log: &[Event]) -> usize {
    log.iter()
        .rposition(|e| matches!(e.kind, EventKind::RoundStarted { .. }))
        .unwrap_or(0)
}

fn check_views(state: &State) -> Result<(), String> {
    let revealed = state.log[round_start(&state.log)..]
        .iter()
        .any(|e| matches!(e.kind, EventKind::PlansRevealed { .. }));
    for viewer in [
        Viewer::Seat(Seat::P0),
        Viewer::Seat(Seat::P1),
        Viewer::Spectator,
    ] {
        check_view(state, viewer, &view(state, viewer), revealed)?;
    }
    for viewer in [
        Viewer::Seat(Seat::P0),
        Viewer::Seat(Seat::P1),
        Viewer::Spectator,
        Viewer::Omniscient,
    ] {
        check_events(state, viewer, 0, &events_since(state, 0, viewer))?;
        let start = log_index(round_start(&state.log));
        check_events(state, viewer, start, &events_since(state, start, viewer))?;
    }
    Ok(())
}

fn log_index(index: usize) -> u32 {
    u32::try_from(index).expect("log length fits in u32")
}

fn check_view(state: &State, viewer: Viewer, shown: &View, revealed: bool) -> Result<(), String> {
    for seat in [Seat::P0, Seat::P1] {
        let real = state.player(seat);
        let player = &shown.players[seat.index()];
        let own = viewer == Viewer::Seat(seat);
        if usize::from(player.hand_size) != real.hand.len() {
            return Err(format!("{viewer:?} sees a wrong hand size for {seat:?}"));
        }
        let hand_ok = if own {
            player.hand.as_ref() == Some(&real.hand)
        } else {
            player.hand.is_none()
        };
        if !hand_ok {
            return Err(format!("{viewer:?} sees a wrong hand for {seat:?}"));
        }
        let plan_ok = match (&real.plan, &player.plan) {
            (None, PlanView::None) => true,
            (Some(plan), PlanView::Revealed(seen)) => (own || revealed) && plan == seen,
            (Some(plan), PlanView::Hidden { target_count }) => {
                !own && !revealed && usize::from(*target_count) == plan.targets.len()
            }
            _ => false,
        };
        if !plan_ok {
            return Err(format!("{viewer:?} sees a wrong plan for {seat:?}"));
        }
    }
    if shown.discard.is_some() {
        return Err(format!("{viewer:?} sees the discard"));
    }
    let start = log_index(round_start(&state.log));
    if leaks_discard(state, shown, &events_since(state, start, viewer)) {
        return Err(format!("{viewer:?} view names the discard"));
    }
    if shown.pending != pending(state) {
        return Err(format!("{viewer:?} sees a wrong pending"));
    }
    Ok(())
}

/// Checks that `shown`, the events from log index `from` given to `viewer`, are exactly
/// the log entries from there that the viewer may see, with their log indices.
fn check_events(
    state: &State,
    viewer: Viewer,
    from: u32,
    shown: &[(u32, Event)],
) -> Result<(), String> {
    for (seq, event) in shown {
        let leaked = match (viewer, event.visibility) {
            (Viewer::Spectator, Visibility::Seat(_)) => true,
            (Viewer::Seat(me), Visibility::Seat(owner)) => owner != me,
            _ => false,
        };
        if leaked {
            return Err(format!("{viewer:?} sees a private event {event:?}"));
        }
        if state.log.get(*seq as usize) != Some(event) {
            return Err(format!("{viewer:?} sees event {seq} out of place"));
        }
    }
    let expected: Vec<u32> = (from as usize..state.log.len())
        .filter(|&i| match (viewer, state.log[i].visibility) {
            (_, Visibility::Public) | (Viewer::Omniscient, _) => true,
            (Viewer::Seat(me), Visibility::Seat(owner)) => owner == me,
            (Viewer::Spectator, Visibility::Seat(_)) => false,
        })
        .map(log_index)
        .collect();
    let seqs: Vec<u32> = shown.iter().map(|(seq, _)| *seq).collect();
    if seqs != expected {
        return Err(format!(
            "{viewer:?} is given events {seqs:?}, not {expected:?}"
        ));
    }
    Ok(())
}

/// Whether the serialised view, or the viewer's events since the round started, name the
/// discard although nothing the viewer has legitimately seen this round does: the plans
/// the view reveals, the Potion target, or the public events.
fn leaks_discard(state: &State, shown: &View, events: &[(u32, Event)]) -> bool {
    let Some(discard) = state.discard else {
        return false;
    };
    let Ok(name) = serde_json::to_string(&discard) else {
        return false;
    };
    let visible_plans: Vec<_> = shown
        .players
        .iter()
        .filter_map(|p| match &p.plan {
            PlanView::Revealed(plan) => Some(plan),
            PlanView::None | PlanView::Hidden { .. } => None,
        })
        .collect();
    let public_events: Vec<_> = events
        .iter()
        .filter(|(_, e)| e.visibility == Visibility::Public)
        .collect();
    let named_publicly =
        serde_json::to_string(&(&shown.potion_target, visible_plans, public_events))
            .is_ok_and(|json| json.contains(&name));
    !named_publicly
        && serde_json::to_string(&(shown, events)).is_ok_and(|json| json.contains(&name))
}

fn derived_seed(base_seed: &[u8; 32], index: u32, label: &str) -> [u8; 32] {
    let mut hasher = blake3::Hasher::new();
    hasher.update(base_seed);
    hasher.update(&index.to_le_bytes());
    hasher.update(label.as_bytes());
    hasher.finalize().into()
}

/// Plays `games` random games with the default rules, seeded deterministically from
/// `base_seed`, checking invariants after every action and verifying every replay.
pub fn fuzz(games: u32, base_seed: [u8; 32]) -> Result<FuzzReport, String> {
    let mut report = FuzzReport {
        games: 0,
        rounds: 0,
        wins: [0; 2],
        by_reason: BTreeMap::new(),
    };
    for index in 0..games {
        let seed = derived_seed(&base_seed, index, "game");
        let chooser_seed = derived_seed(&base_seed, index, "chooser");
        let (replay, state) = play(seed, RulesConfig::default(), chooser_seed)
            .map_err(|err| format!("game {index}: {err}"))?;
        verify(&replay).map_err(|err| format!("game {index}: replay failed to verify: {err}"))?;
        let Phase::GameOver { winner, reason } = state.phase else {
            return Err(format!("game {index} did not end"));
        };
        report.games += 1;
        report.rounds += u64::from(state.round);
        report.wins[winner.index()] += 1;
        let key = match reason {
            WinReason::Health => "health",
            WinReason::Fangs => "fangs",
            WinReason::Crosses => "crosses",
            WinReason::Resignation => "resignation",
        };
        *report.by_reason.entry(key.to_string()).or_insert(0) += 1;
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::new_game;

    fn fresh() -> State {
        new_game([5; 32], RulesConfig::default())
    }

    #[test]
    fn untampered_views_pass() {
        assert_eq!(check_invariants(&fresh()), Ok(()));
    }

    #[test]
    fn tampered_views_are_reported() {
        let state = fresh();
        let me = Viewer::Seat(Seat::P0);
        let honest = view(&state, me);
        assert_eq!(check_view(&state, me, &honest, false), Ok(()));

        let mut shown = honest.clone();
        shown.players[1].hand = Some(state.player(Seat::P1).hand.clone());
        assert!(check_view(&state, me, &shown, false).is_err());

        let mut shown = honest.clone();
        shown.discard = state.discard;
        assert!(check_view(&state, me, &shown, false).is_err());

        let mut shown = honest.clone();
        shown.players[1].hand_size += 1;
        assert!(check_view(&state, me, &shown, false).is_err());

        let spectator = Viewer::Spectator;
        let mut events = events_since(&state, 0, spectator);
        assert_eq!(check_events(&state, spectator, 0, &events), Ok(()));
        events.push((
            0,
            Event {
                visibility: Visibility::Seat(Seat::P0),
                kind: EventKind::AttackMissed { seat: Seat::P0 },
            },
        ));
        assert!(check_events(&state, spectator, 0, &events).is_err());
        let mut events = events_since(&state, 0, me);
        events.pop();
        assert!(check_events(&state, me, 0, &events).is_err());

        let discard = state.discard.expect("a round is dealt");
        let mut events = events_since(&state, 0, me);
        assert!(!leaks_discard(&state, &honest, &events));
        events.push((
            99,
            Event {
                visibility: Visibility::Seat(Seat::P0),
                kind: EventKind::HandDealt {
                    seat: Seat::P0,
                    cards: vec![discard],
                },
            },
        ));
        assert!(leaks_discard(&state, &honest, &events));
    }

    #[test]
    fn a_hidden_plan_naming_the_discard_does_not_excuse_a_leak() {
        let mut state = fresh();
        let me = Viewer::Seat(Seat::P0);
        let discard = state.discard.expect("a round is dealt");
        let opponent = state.player(Seat::P1);
        state.players[1].plan = Some(crate::Plan {
            character: opponent.hand[0],
            targets: [crate::TargetCard::Character(discard)].into(),
        });
        let honest = view(&state, me);
        let events = events_since(&state, 0, me);
        assert!(!leaks_discard(&state, &honest, &events));

        let mut shown = honest;
        if let Some(hand) = &mut shown.players[0].hand {
            hand.push(discard);
        }
        assert!(leaks_discard(&state, &shown, &events));
    }
}
