#![cfg(feature = "unsafe-edit")]

mod common;

use common::{assert_conserved, scenario};
use wwd_core::Character::*;
use wwd_core::{
    Character, Command, Edit, Event, EventKind, Phase, Plan, RuleError, Seat, State, TargetCard,
    Tiebreak, Visibility, WinReason, apply, apply_edit,
};

fn c(character: Character) -> TargetCard {
    TargetCard::Character(character)
}

fn submit(
    state: &mut State,
    seat: Seat,
    character: Character,
    targets: &[TargetCard],
) -> Result<Vec<Event>, RuleError> {
    apply(
        state,
        seat,
        Command::SubmitPlan {
            character,
            targets: targets.to_vec(),
        },
    )
}

fn place(state: &mut State, seat: Seat, n: u8) -> Result<Vec<Event>, RuleError> {
    apply(state, seat, Command::PlaceHourglasses { n })
}

/// Badge on P0, humans against werewolves, Villager discarded.
fn standard() -> State {
    scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    )
}

fn revealed(events: &[Event]) -> ([Plan; 2], [u8; 2], [Seat; 2]) {
    events
        .iter()
        .find_map(|e| match &e.kind {
            EventKind::PlansRevealed {
                plans,
                effective,
                order,
            } => Some((plans.clone(), *effective, *order)),
            _ => None,
        })
        .expect("plans should be revealed")
}

#[test]
fn plan_rejects_card_not_in_hand() {
    let mut state = standard();
    let before = state.clone();
    assert_eq!(
        submit(&mut state, Seat::P0, Wolfen, &[c(Seer)]),
        Err(RuleError::CharacterNotInHand)
    );
    assert_eq!(state, before);
}

#[test]
fn plan_rejects_second_submission() {
    let mut state = standard();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).unwrap();
    assert_eq!(
        submit(&mut state, Seat::P0, Seer, &[c(Wolfen)]),
        Err(RuleError::WrongPhase)
    );
}

#[test]
fn plan_may_target_own_hand_and_fool_alone() {
    let mut state = scenario(
        Seat::P0,
        &[Knight, Wolfen, Seer, Witch],
        &[WolfKing, Hunter, WolfBeauty],
        Villager,
    );
    assert!(submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).is_ok());
    assert!(submit(&mut state, Seat::P1, Hunter, &[TargetCard::Fool]).is_ok());
}

#[test]
fn plan_rejects_duplicate_targets() {
    let mut state = standard();
    assert_eq!(
        submit(&mut state, Seat::P0, Hunter, &[c(Wolfen), c(Wolfen)]),
        Err(RuleError::TargetNotAllowed)
    );
}

#[test]
fn plan_is_validated_against_targeting_rules() {
    let mut state = standard();
    assert_eq!(
        submit(&mut state, Seat::P0, Knight, &[c(Seer)]),
        Err(RuleError::TargetNotAllowed)
    );
    assert_eq!(
        submit(&mut state, Seat::P0, Knight, &[]),
        Err(RuleError::TooFewTargets)
    );
}

#[test]
fn plan_target_count_public_identities_hidden() {
    let mut state = standard();
    let events = submit(&mut state, Seat::P0, Knight, &[c(Wolfen), TargetCard::Fool]).unwrap();
    assert_eq!(
        events,
        vec![Event {
            visibility: Visibility::Public,
            kind: EventKind::PlanSubmitted {
                seat: Seat::P0,
                target_count: 2,
            },
        }]
    );
    let json = serde_json::to_string(&events).unwrap();
    assert!(!json.contains("wolfen") && !json.contains("knight"));
    assert_eq!(state.log.last(), events.last());
}

#[test]
fn both_plans_clear_hands_and_open_hourglass_reveal() {
    let mut state = standard();
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]).unwrap();
    assert_eq!(state.phase, Phase::Plan);
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).unwrap();
    assert!(state.players.iter().all(|p| p.hand.is_empty()));
    assert_eq!(state.phase, Phase::RevealHourglass { seat: Seat::P0 });
}

#[test]
fn command_kind_must_match_phase() {
    let mut state = standard();
    assert_eq!(place(&mut state, Seat::P0, 0), Err(RuleError::WrongPhase));
    assert_eq!(
        apply(
            &mut state,
            Seat::P0,
            Command::HunterSpendCross { spend: true }
        ),
        Err(RuleError::WrongPhase)
    );
}

#[test]
fn game_over_rejects_everything() {
    let mut state = standard();
    state.phase = Phase::GameOver {
        winner: Seat::P0,
        reason: WinReason::Health,
    };
    assert_eq!(
        submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]),
        Err(RuleError::GameOver)
    );
}

#[test]
fn hourglass_order_badge_first() {
    let mut state = standard();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).unwrap();
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]).unwrap();
    assert_eq!(place(&mut state, Seat::P1, 0), Err(RuleError::NotYourTurn));
    let events = place(&mut state, Seat::P0, 0).unwrap();
    assert_eq!(
        events,
        vec![Event {
            visibility: Visibility::Public,
            kind: EventKind::HourglassesPlaced {
                seat: Seat::P0,
                n: 0
            },
        }]
    );
    assert_eq!(state.phase, Phase::RevealHourglass { seat: Seat::P1 });
    assert_eq!(place(&mut state, Seat::P0, 0), Err(RuleError::NotYourTurn));
}

#[test]
fn hourglass_over_reserve_rejected() {
    let mut state = standard();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).unwrap();
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]).unwrap();
    assert_eq!(
        place(&mut state, Seat::P0, 1),
        Err(RuleError::NotEnoughHourglasses)
    );
    place(&mut state, Seat::P0, 0).unwrap();
    assert_eq!(
        place(&mut state, Seat::P1, 2),
        Err(RuleError::NotEnoughHourglasses)
    );
}

#[test]
fn reveal_without_potion_hands_off_and_returns_placed_hourglasses() {
    let mut state = standard();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).unwrap();
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]).unwrap();
    place(&mut state, Seat::P0, 0).unwrap();
    let log_before = state.log.len();
    let events = place(&mut state, Seat::P1, 1).unwrap();
    assert_eq!(&state.log[log_before..], events.as_slice());

    let (plans, effective, order) = revealed(&events);
    assert_eq!(plans[0].character, Knight);
    assert_eq!(plans[1].character, Wolfen);
    assert_eq!(effective, [3, 3]);
    assert_eq!(order, [Seat::P1, Seat::P0]);
    let reveal = events
        .iter()
        .find(|e| matches!(e.kind, EventKind::PlansRevealed { .. }))
        .unwrap();
    assert_eq!(reveal.visibility, Visibility::Public);
    assert!(events.iter().any(|e| e.kind
        == EventKind::RoundEnded {
            round: 1,
            next_badge: Seat::P1
        }));
    assert_eq!(state.round, 1);
    assert_eq!(state.badge, Seat::P1);
    assert_eq!(state.phase, Phase::RoundOver);
    assert!(state.players.iter().all(|p| p.placed == 0));
    // The placed Hourglass returns; the Wolfen, resolving first, also gained one.
    assert_eq!(state.player(Seat::P1).hourglass, 1);
    assert_eq!(state.supply.hourglass, 4);
    assert_conserved(&state);

    apply(&mut state, Seat::P0, Command::NextRound).unwrap();
    apply(&mut state, Seat::P1, Command::NextRound).unwrap();
    assert_eq!(state.round, 2);
    assert_eq!(state.phase, Phase::Plan);
    assert!(state.showdown.is_none());
    assert!(state.players.iter().all(|p| p.plan.is_none()));
    assert_eq!(state.player(Seat::P1).hand.len(), 4);
    assert_eq!(state.player(Seat::P0).hand.len(), 3);
    assert_conserved(&state);
}

#[test]
fn potion_holder_must_choose_unplayed_target() {
    let mut state = standard();
    apply_edit(
        &mut state,
        Edit::SetPotion {
            seat: Some(Seat::P0),
        },
    )
    .unwrap();
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]).unwrap();
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]).unwrap();
    place(&mut state, Seat::P0, 0).unwrap();
    let events = place(&mut state, Seat::P1, 0).unwrap();
    assert!(
        !events
            .iter()
            .any(|e| matches!(e.kind, EventKind::PlansRevealed { .. }))
    );
    assert_eq!(state.phase, Phase::RevealPotion { seat: Seat::P0 });

    assert_eq!(
        apply(
            &mut state,
            Seat::P1,
            Command::ChoosePotionTarget { card: Seer }
        ),
        Err(RuleError::NotYourTurn)
    );
    assert_eq!(
        apply(
            &mut state,
            Seat::P0,
            Command::ChoosePotionTarget { card: Wolfen }
        ),
        Err(RuleError::InvalidPotionTarget)
    );
    let events = apply(
        &mut state,
        Seat::P0,
        Command::ChoosePotionTarget { card: Seer },
    )
    .unwrap();
    assert_eq!(
        events[0],
        Event {
            visibility: Visibility::Public,
            kind: EventKind::PotionTargetChosen {
                seat: Seat::P0,
                card: Seer,
            },
        }
    );
    revealed(&events);
    assert!(state.supply.potion);
    assert!(!state.player(Seat::P0).potion);
    assert_conserved(&state);
}

/// Plays P0 Hunter→{WolfKing} against P1 WolfKing→{Hunter} and returns the revealed
/// effective initiatives and resolution order.
fn hunter_vs_wolf_king(badge: Seat, tiebreak: Tiebreak, placed: [u8; 2]) -> ([u8; 2], [Seat; 2]) {
    let (p0, p1): (&[Character], &[Character]) = match badge {
        Seat::P0 => (
            &[Hunter, Knight, Seer, Witch],
            &[WolfKing, Wolfen, WolfBeauty],
        ),
        Seat::P1 => (
            &[Hunter, Knight, Seer],
            &[WolfKing, Wolfen, WolfBeauty, Witch],
        ),
    };
    let mut state = scenario(badge, p0, p1, Villager);
    state.config.tiebreak = tiebreak;
    for seat in [Seat::P0, Seat::P1] {
        apply_edit(
            &mut state,
            Edit::SetHourglass {
                seat,
                n: placed[seat.index()],
            },
        )
        .unwrap();
    }
    submit(&mut state, Seat::P0, Hunter, &[c(WolfKing)]).unwrap();
    submit(&mut state, Seat::P1, WolfKing, &[c(Hunter)]).unwrap();
    place(&mut state, badge, placed[badge.index()]).unwrap();
    let other = badge.other();
    let events = place(&mut state, other, placed[other.index()]).unwrap();
    assert_conserved(&state);
    let (_, effective, order) = revealed(&events);
    (effective, order)
}

#[test]
fn initiative_clamps_and_tiebreaks_on_hourglasses() {
    let hg = Tiebreak::HourglassesThenBadge;
    assert_eq!(
        hunter_vs_wolf_king(Seat::P1, hg, [3, 2]),
        ([0, 0], [Seat::P0, Seat::P1])
    );
    assert_eq!(
        hunter_vs_wolf_king(Seat::P0, hg, [2, 3]),
        ([0, 0], [Seat::P1, Seat::P0])
    );
    assert_eq!(
        hunter_vs_wolf_king(Seat::P1, hg, [2, 2]),
        ([0, 0], [Seat::P1, Seat::P0])
    );
    assert_eq!(
        hunter_vs_wolf_king(Seat::P1, Tiebreak::BadgeOnly, [3, 2]),
        ([0, 0], [Seat::P1, Seat::P0])
    );
    assert_eq!(
        hunter_vs_wolf_king(Seat::P0, Tiebreak::BadgeOnly, [2, 3]),
        ([0, 0], [Seat::P0, Seat::P1])
    );
}

#[test]
fn lower_effective_initiative_goes_first_regardless_of_badge() {
    assert_eq!(
        hunter_vs_wolf_king(Seat::P1, Tiebreak::HourglassesThenBadge, [0, 0]),
        ([1, 2], [Seat::P0, Seat::P1])
    );
    assert_eq!(
        hunter_vs_wolf_king(Seat::P0, Tiebreak::HourglassesThenBadge, [0, 2]),
        ([1, 0], [Seat::P1, Seat::P0])
    );
}
