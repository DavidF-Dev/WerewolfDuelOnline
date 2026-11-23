use std::cmp::Ordering;
use std::collections::BTreeSet;

use crate::command::Command;
use crate::event::{Event, EventKind, Visibility};
use crate::game::start_round;
use crate::showdown::{resolve_showdown, resume_hunter};
use crate::state::{Phase, PotionTarget, Showdown, State, WinReason};
use crate::targeting::validate_plan;
use crate::types::{Character, Plan, RuleError, Seat, TargetCard, Tiebreak};

/// Applies `cmd` from `seat`, appending to the log and returning only the events this
/// call appended. On error the state is unchanged.
pub fn apply(state: &mut State, seat: Seat, cmd: Command) -> Result<Vec<Event>, RuleError> {
    if matches!(state.phase, Phase::GameOver { .. }) {
        return Err(RuleError::GameOver);
    }
    let mut events = Vec::new();
    if cmd == Command::Resign {
        resign(state, seat, &mut events);
        state.log.extend(events.iter().cloned());
        return Ok(events);
    }
    match (state.phase.clone(), cmd) {
        (Phase::Plan, Command::SubmitPlan { character, targets }) => {
            submit_plan(state, seat, character, targets, &mut events)?;
        }
        (Phase::RevealHourglass { seat: turn }, Command::PlaceHourglasses { n }) => {
            ensure_turn(seat, turn)?;
            place_hourglasses(state, seat, n, &mut events)?;
        }
        (Phase::RevealPotion { seat: turn }, Command::ChoosePotionTarget { card }) => {
            ensure_turn(seat, turn)?;
            choose_potion_target(state, seat, card, &mut events)?;
        }
        (Phase::HunterChoice { seat: turn }, Command::HunterSpendCross { spend }) => {
            ensure_turn(seat, turn)?;
            resume_hunter(state, seat, spend, &mut events);
        }
        (Phase::RoundOver, Command::NextRound) => {
            next_round(state, seat, &mut events)?;
        }
        _ => return Err(RuleError::WrongPhase),
    }
    state.log.extend(events.iter().cloned());
    Ok(events)
}

/// Printed initiative less placed Hourglasses, clamped at zero.
pub fn effective_initiative(character: Character, placed: u8) -> u8 {
    character.initiative().saturating_sub(placed)
}

fn seat_initiative(state: &State, seat: Seat) -> u8 {
    let player = state.player(seat);
    let plan = player
        .plan
        .as_ref()
        .expect("effective initiative needs a submitted plan");
    effective_initiative(plan.character, player.placed)
}

/// The seats in showdown order: lowest effective initiative first, then the tiebreak.
///
/// # Panics
///
/// Panics if either seat has not submitted a plan.
pub fn resolution_order(state: &State) -> [Seat; 2] {
    let badge = state.badge;
    let other = badge.other();
    let first = match seat_initiative(state, badge).cmp(&seat_initiative(state, other)) {
        Ordering::Less => badge,
        Ordering::Greater => other,
        Ordering::Equal => match state.config.tiebreak {
            Tiebreak::HourglassesThenBadge
                if state.player(other).placed > state.player(badge).placed =>
            {
                other
            }
            Tiebreak::HourglassesThenBadge | Tiebreak::BadgeOnly => badge,
        },
    };
    [first, first.other()]
}

fn resign(state: &mut State, seat: Seat, events: &mut Vec<Event>) {
    let winner = seat.other();
    let reason = WinReason::Resignation;
    public(events, EventKind::Resigned { seat });
    public(events, EventKind::GameOver { winner, reason });
    state.phase = Phase::GameOver { winner, reason };
}

fn ensure_turn(seat: Seat, turn: Seat) -> Result<(), RuleError> {
    if seat == turn {
        Ok(())
    } else {
        Err(RuleError::NotYourTurn)
    }
}

fn public(events: &mut Vec<Event>, kind: EventKind) {
    events.push(Event {
        visibility: Visibility::Public,
        kind,
    });
}

fn submit_plan(
    state: &mut State,
    seat: Seat,
    character: Character,
    targets: Vec<TargetCard>,
    events: &mut Vec<Event>,
) -> Result<(), RuleError> {
    let player = state.player(seat);
    if player.plan.is_some() {
        return Err(RuleError::WrongPhase);
    }
    if !player.hand.contains(&character) {
        return Err(RuleError::CharacterNotInHand);
    }
    let raw_len = targets.len();
    let targets: BTreeSet<TargetCard> = targets.into_iter().collect();
    if targets.len() != raw_len {
        return Err(RuleError::TargetNotAllowed);
    }
    let plan = Plan { character, targets };
    validate_plan(&plan, &state.config)?;

    let target_count = u8::try_from(plan.targets.len()).expect("at most nine target cards");
    state.player_mut(seat).plan = Some(plan);
    public(events, EventKind::PlanSubmitted { seat, target_count });

    if state.players.iter().all(|p| p.plan.is_some()) {
        for player in &mut state.players {
            player.hand.clear();
        }
        state.phase = Phase::RevealHourglass { seat: state.badge };
    }
    Ok(())
}

fn place_hourglasses(
    state: &mut State,
    seat: Seat,
    n: u8,
    events: &mut Vec<Event>,
) -> Result<(), RuleError> {
    let player = state.player_mut(seat);
    if n > player.hourglass {
        return Err(RuleError::NotEnoughHourglasses);
    }
    player.hourglass -= n;
    player.placed += n;
    public(events, EventKind::HourglassesPlaced { seat, n });

    if seat == state.badge {
        state.phase = Phase::RevealHourglass { seat: seat.other() };
    } else if let Some(holder) = [Seat::P0, Seat::P1]
        .into_iter()
        .find(|&s| state.player(s).potion)
    {
        state.phase = Phase::RevealPotion { seat: holder };
    } else {
        reveal(state, events);
    }
    Ok(())
}

fn choose_potion_target(
    state: &mut State,
    seat: Seat,
    card: Character,
    events: &mut Vec<Event>,
) -> Result<(), RuleError> {
    let played = state
        .player(seat)
        .plan
        .as_ref()
        .is_some_and(|plan| plan.targets.contains(&TargetCard::Character(card)));
    if played {
        return Err(RuleError::InvalidPotionTarget);
    }
    state.potion_target = Some(PotionTarget { holder: seat, card });
    state.player_mut(seat).potion = false;
    state.supply.potion = true;
    public(events, EventKind::PotionTargetChosen { seat, card });
    reveal(state, events);
    Ok(())
}

fn next_round(state: &mut State, seat: Seat, events: &mut Vec<Event>) -> Result<(), RuleError> {
    let ready = &mut state.next_round_ready[seat.index()];
    if *ready {
        return Err(RuleError::WrongPhase);
    }
    *ready = true;
    public(events, EventKind::NextRoundRequested { seat });
    if state.next_round_ready == [true; 2] {
        start_round(state, events);
    }
    Ok(())
}

fn reveal(state: &mut State, events: &mut Vec<Event>) {
    let plans = state.players.each_ref().map(|p| {
        p.plan
            .clone()
            .expect("both plans are submitted before reveal")
    });
    let effective = [Seat::P0, Seat::P1].map(|s| seat_initiative(state, s));
    let order = resolution_order(state);
    public(
        events,
        EventKind::PlansRevealed {
            plans,
            effective,
            order,
        },
    );
    state.showdown = Some(Showdown {
        order,
        next: 0,
        resolved: [false; 2],
        eliminated: [false; 2],
    });
    resolve_showdown(state, events);
}
