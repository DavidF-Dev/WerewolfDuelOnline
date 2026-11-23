use std::collections::BTreeSet;

use crate::end::{check_game_end, end_round};
use crate::event::{Event, EventKind, ForfeitReason, Marker, Visibility};
use crate::state::{Phase, PotionTarget, Showdown, State};
use crate::types::{Character, Plan, Seat, TargetCard};

/// Whether resolution may carry on after a step.
enum Flow {
    Continue,
    Stop,
}

/// Resolves the revealed showdown from `showdown.next`, appending its events to `events`.
///
/// Stops when the Hunter's owner must choose, when the game ends, or at round end.
pub(crate) fn resolve_showdown(state: &mut State, events: &mut Vec<Event>) {
    if let Flow::Stop = resolve_potion(state, events) {
        return;
    }
    while let Some(seat) = next_seat(showdown(state)) {
        if showdown(state).eliminated[seat.index()] {
            showdown_mut(state).next += 1;
            continue;
        }
        let character = played(state, seat);
        showdown_mut(state).resolved[seat.index()] = true;
        public(events, EventKind::CharacterResolved { seat, character });

        if character == Character::Hunter && state.player(seat).cross > 0 {
            state.phase = Phase::HunterChoice { seat };
            return;
        }
        let flow = resolve_character(state, seat, character, events);
        showdown_mut(state).next += 1;
        if let Flow::Stop = flow {
            return;
        }
    }
    end_round(state, events);
}

/// Completes the paused Hunter with its owner's choice, then continues the showdown.
pub(crate) fn resume_hunter(state: &mut State, seat: Seat, spend: bool, events: &mut Vec<Event>) {
    let flow = if !spend {
        forfeit(events, seat, ForfeitReason::Declined)
    } else if state.player(seat).cross == 0 {
        forfeit(events, seat, ForfeitReason::NoCross)
    } else {
        state.player_mut(seat).cross -= 1;
        state.supply.cross += 1;
        public(
            events,
            EventKind::MarkerSpent {
                seat,
                marker: Marker::Cross,
                n: 1,
            },
        );
        match game_end(state, events) {
            Flow::Continue => attack(state, seat, 1, events),
            Flow::Stop => Flow::Stop,
        }
    };
    showdown_mut(state).next += 1;
    if let Flow::Continue = flow {
        resolve_showdown(state, events);
    }
}

fn resolve_potion(state: &mut State, events: &mut Vec<Event>) -> Flow {
    let Some(PotionTarget {
        holder,
        card: target,
    }) = state.potion_target.take()
    else {
        return Flow::Continue;
    };
    let victim = holder.other();
    let hit = played(state, victim) == target;
    let mut health_lost = 0;
    if hit {
        showdown_mut(state).eliminated[victim.index()] = true;
        let player = state.player_mut(victim);
        health_lost = player.health.min(1);
        player.health -= health_lost;
    }
    public(
        events,
        EventKind::PotionResolved {
            target,
            victim,
            hit,
            health_lost,
        },
    );
    if hit {
        game_end(state, events)
    } else {
        Flow::Continue
    }
}

fn resolve_character(
    state: &mut State,
    seat: Seat,
    character: Character,
    events: &mut Vec<Event>,
) -> Flow {
    match character {
        Character::Hunter => forfeit(events, seat, ForfeitReason::NoCross),
        Character::WolfKing => wolf_king(state, seat, events),
        Character::Knight | Character::Wolfen => match gain_hourglass(state, seat, events) {
            Flow::Continue => attack(state, seat, 1, events),
            Flow::Stop => Flow::Stop,
        },
        Character::Seer => attack(state, seat, 2, events),
        Character::Witch => {
            state.player_mut(seat).potion = true;
            state.supply.potion = false;
            gained(events, seat, Marker::Potion, false);
            game_end(state, events)
        }
        Character::WolfBeauty => match gain_from_supply(state, seat, Marker::Fang, events) {
            Flow::Continue => attack(state, seat, 1, events),
            Flow::Stop => Flow::Stop,
        },
        Character::Villager => gain_from_supply(state, seat, Marker::Cross, events),
    }
}

fn wolf_king(state: &mut State, seat: Seat, events: &mut Vec<Event>) -> Flow {
    let targets = plan_targets(state, seat)
        .iter()
        .filter(|t| matches!(t, TargetCard::Character(_)))
        .count();
    if targets == 0 {
        return forfeit(events, seat, ForfeitReason::NoTargets);
    }
    let extra = u8::try_from(targets - 1).expect("at most nine target cards");
    if extra > state.player(seat).fang {
        return forfeit(events, seat, ForfeitReason::CannotPayFangs);
    }
    if extra > 0 {
        state.player_mut(seat).fang -= extra;
        state.supply.fang += extra;
        public(
            events,
            EventKind::MarkerSpent {
                seat,
                marker: Marker::Fang,
                n: extra,
            },
        );
        if let Flow::Stop = game_end(state, events) {
            return Flow::Stop;
        }
    }
    attack(state, seat, 1, events)
}

fn attack(state: &mut State, seat: Seat, damage: u8, events: &mut Vec<Event>) -> Flow {
    let opponent = seat.other();
    let character = played(state, opponent);
    let progress = showdown(state);
    let hit = plan_targets(state, seat).contains(&TargetCard::Character(character))
        && !progress.resolved[opponent.index()]
        && !progress.eliminated[opponent.index()];
    if !hit {
        public(events, EventKind::AttackMissed { seat });
        return Flow::Continue;
    }
    showdown_mut(state).eliminated[opponent.index()] = true;
    let player = state.player_mut(opponent);
    let before = player.health;
    player.health = before.saturating_sub(damage);
    let health_lost = before - player.health;
    public(
        events,
        EventKind::AttackHit {
            seat,
            target_seat: opponent,
            character,
            health_lost,
        },
    );
    game_end(state, events)
}

/// Takes an Hourglass from the supply, else from the opponent's reserve, else gains nothing.
fn gain_hourglass(state: &mut State, seat: Seat, events: &mut Vec<Event>) -> Flow {
    let from_opponent = if state.supply.hourglass > 0 {
        state.supply.hourglass -= 1;
        false
    } else if state.player(seat.other()).hourglass > 0 {
        state.player_mut(seat.other()).hourglass -= 1;
        true
    } else {
        return Flow::Continue;
    };
    state.player_mut(seat).hourglass += 1;
    gained(events, seat, Marker::Hourglass, from_opponent);
    game_end(state, events)
}

/// Gains a Cross or Fang from the supply; gains nothing if the supply is empty.
fn gain_from_supply(
    state: &mut State,
    seat: Seat,
    marker: Marker,
    events: &mut Vec<Event>,
) -> Flow {
    let (supply, held) = match marker {
        Marker::Cross => (
            &mut state.supply.cross,
            &mut state.players[seat.index()].cross,
        ),
        Marker::Fang => (
            &mut state.supply.fang,
            &mut state.players[seat.index()].fang,
        ),
        Marker::Hourglass | Marker::Potion => unreachable!("only Crosses and Fangs come from here"),
    };
    if *supply == 0 {
        return Flow::Continue;
    }
    *supply -= 1;
    *held += 1;
    gained(events, seat, marker, false);
    game_end(state, events)
}

fn game_end(state: &mut State, events: &mut Vec<Event>) -> Flow {
    if check_game_end(state, events) {
        Flow::Stop
    } else {
        Flow::Continue
    }
}

fn forfeit(events: &mut Vec<Event>, seat: Seat, reason: ForfeitReason) -> Flow {
    public(events, EventKind::AttackForfeited { seat, reason });
    Flow::Continue
}

fn gained(events: &mut Vec<Event>, seat: Seat, marker: Marker, from_opponent: bool) {
    public(
        events,
        EventKind::MarkerGained {
            seat,
            marker,
            from_opponent,
        },
    );
}

fn public(events: &mut Vec<Event>, kind: EventKind) {
    events.push(Event {
        visibility: Visibility::Public,
        kind,
    });
}

fn next_seat(showdown: &Showdown) -> Option<Seat> {
    showdown.order.get(usize::from(showdown.next)).copied()
}

fn showdown(state: &State) -> &Showdown {
    state.showdown.as_ref().expect("showdown runs after reveal")
}

fn showdown_mut(state: &mut State) -> &mut Showdown {
    state.showdown.as_mut().expect("showdown runs after reveal")
}

fn played(state: &State, seat: Seat) -> Character {
    plan(state, seat).character
}

fn plan_targets(state: &State, seat: Seat) -> &BTreeSet<TargetCard> {
    &plan(state, seat).targets
}

fn plan(state: &State, seat: Seat) -> &Plan {
    state
        .player(seat)
        .plan
        .as_ref()
        .expect("both plans are submitted before showdown")
}
