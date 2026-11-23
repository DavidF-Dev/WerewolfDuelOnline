use crate::event::{Event, EventKind, Visibility};
use crate::state::{Phase, State, WIN_CROSS, WIN_FANG, WinReason};
use crate::types::Seat;

const SEATS: [Seat; 2] = [Seat::P0, Seat::P1];

/// Reports whether the game has ended, setting the game-over phase and appending a
/// `GameOver` event if so.
///
/// Checks, in order: a player at 0 Health loses, then a player with enough Fangs wins,
/// then a player with enough Crosses wins.
pub(crate) fn check_game_end(state: &mut State, events: &mut Vec<Event>) -> bool {
    let Some((winner, reason)) = game_result(state) else {
        return false;
    };
    state.phase = Phase::GameOver { winner, reason };
    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::GameOver { winner, reason },
    });
    true
}

fn game_result(state: &State) -> Option<(Seat, WinReason)> {
    if let Some(loser) = SEATS.into_iter().find(|&s| state.player(s).health == 0) {
        return Some((loser.other(), WinReason::Health));
    }
    if let Some(winner) = SEATS
        .into_iter()
        .find(|&s| state.player(s).fang >= WIN_FANG)
    {
        return Some((winner, WinReason::Fangs));
    }
    SEATS
        .into_iter()
        .find(|&s| state.player(s).cross >= WIN_CROSS)
        .map(|winner| (winner, WinReason::Crosses))
}

/// Returns placed Hourglasses, passes the Badge, appends `RoundEnded` and stops in
/// [`Phase::RoundOver`] with nothing dealt, forgetting the round's discard.
pub(crate) fn end_round(state: &mut State, events: &mut Vec<Event>) {
    for player in &mut state.players {
        state.supply.hourglass += player.placed;
        player.placed = 0;
    }
    state.badge = state.badge.other();
    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::RoundEnded {
            round: state.round,
            next_badge: state.badge,
        },
    });
    state.discard = None;
    state.next_round_ready = [false; 2];
    state.phase = Phase::RoundOver;
}
