#![cfg(feature = "unsafe-edit")]

mod common;

use common::{assert_conserved, scenario};
use wwd_core::Character::*;
use wwd_core::{
    Character, Command, Edit, Event, EventKind, MinTargets, Pending, PendingKind, Phase, PlanView,
    RuleError, RulesConfig, Seat, State, TargetCard, View, Viewer, Visibility, WinReason, apply,
    apply_edit, events_since, legal_actions, new_game, pending, view, visible_to,
};

fn c(character: Character) -> TargetCard {
    TargetCard::Character(character)
}

fn submit(state: &mut State, seat: Seat, character: Character, targets: &[TargetCard]) {
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

fn place(state: &mut State, seat: Seat, n: u8) -> Vec<Event> {
    apply(state, seat, Command::PlaceHourglasses { n }).expect("placement should be accepted")
}

fn edit(state: &mut State, edit: Edit) {
    apply_edit(state, edit).expect("edit should be accepted");
}

fn kinds(events: &[Event]) -> Vec<EventKind> {
    events.iter().map(|e| e.kind.clone()).collect()
}

fn resolved(events: &[Event], seat: Seat) -> usize {
    events
        .iter()
        .filter(|e| matches!(e.kind, EventKind::CharacterResolved { seat: s, .. } if s == seat))
        .count()
}

fn game_over_event(events: &[Event]) -> Option<&Event> {
    events
        .iter()
        .find(|e| matches!(e.kind, EventKind::GameOver { .. }))
}

/// Badge on P0, humans against werewolves, Villager discarded.
fn humans_vs_wolves() -> State {
    scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    )
}

/// Badge on P0, P0 holds the werewolves, Witch discarded.
fn wolves_vs_humans() -> State {
    scenario(
        Seat::P0,
        &[WolfKing, Wolfen, WolfBeauty, Villager],
        &[Hunter, Knight, Seer],
        Witch,
    )
}

fn assert_game_over(state: &State, events: &[Event], winner: Seat, reason: WinReason) {
    assert_eq!(state.phase, Phase::GameOver { winner, reason });
    let event = game_over_event(events).expect("a game-over event");
    assert_eq!(event.visibility, Visibility::Public);
    assert_eq!(event.kind, EventKind::GameOver { winner, reason });
    assert_eq!(events.last(), Some(event));
    assert!(
        !kinds(events)
            .iter()
            .any(|k| matches!(k, EventKind::RoundEnded { .. }))
    );
}

#[test]
fn win_mid_showdown_stops_resolution() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Villager],
        &[WolfKing, Wolfen, WolfBeauty],
        Witch,
    );
    edit(
        &mut state,
        Edit::SetCross {
            seat: Seat::P0,
            n: 3,
        },
    );
    edit(
        &mut state,
        Edit::SetHourglass {
            seat: Seat::P0,
            n: 2,
        },
    );
    submit(&mut state, Seat::P0, Villager, &[TargetCard::Fool]);
    submit(&mut state, Seat::P1, WolfBeauty, &[c(Villager)]);
    place(&mut state, Seat::P0, 2);
    let events = place(&mut state, Seat::P1, 0);

    let revealed = kinds(&events).into_iter().find_map(|k| match k {
        EventKind::PlansRevealed { effective, .. } => Some(effective),
        _ => None,
    });
    assert_eq!(revealed, Some([6, 7]));
    assert_game_over(&state, &events, Seat::P0, WinReason::Crosses);
    assert_eq!(state.player(Seat::P0).cross, 4);
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert_eq!(state.player(Seat::P0).health, 2);
    assert_eq!(state.round, 1);
    assert_eq!(state.player(Seat::P0).placed, 2);
    assert_conserved(&state);

    let before = state.clone();
    for (seat, cmd) in [
        (Seat::P0, Command::PlaceHourglasses { n: 0 }),
        (Seat::P1, Command::HunterSpendCross { spend: false }),
        (
            Seat::P1,
            Command::SubmitPlan {
                character: Wolfen,
                targets: vec![TargetCard::Fool],
            },
        ),
    ] {
        assert_eq!(apply(&mut state, seat, cmd), Err(RuleError::GameOver));
    }
    assert_eq!(state, before);
}

#[test]
fn seer_damage_clamps_at_zero() {
    let mut state = humans_vs_wolves();
    edit(
        &mut state,
        Edit::SetHealth {
            seat: Seat::P1,
            n: 1,
        },
    );
    edit(
        &mut state,
        Edit::SetHourglass {
            seat: Seat::P0,
            n: 2,
        },
    );
    submit(&mut state, Seat::P0, Seer, &[c(Wolfen)]);
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);
    place(&mut state, Seat::P0, 2);
    let events = place(&mut state, Seat::P1, 0);

    assert!(kinds(&events).contains(&EventKind::AttackHit {
        seat: Seat::P0,
        target_seat: Seat::P1,
        attacker: Seer,
        character: Wolfen,
        health_lost: 1,
    }));
    assert_eq!(state.player(Seat::P1).health, 0);
    assert_game_over(&state, &events, Seat::P0, WinReason::Health);
    assert_conserved(&state);
}

#[test]
fn wolf_beauty_third_fang_wins() {
    let mut state = wolves_vs_humans();
    edit(
        &mut state,
        Edit::SetFang {
            seat: Seat::P0,
            n: 2,
        },
    );
    edit(
        &mut state,
        Edit::SetHourglass {
            seat: Seat::P0,
            n: 3,
        },
    );
    submit(&mut state, Seat::P0, WolfBeauty, &[c(Seer)]);
    submit(&mut state, Seat::P1, Seer, &[c(Wolfen)]);
    place(&mut state, Seat::P0, 3);
    let events = place(&mut state, Seat::P1, 0);

    assert_game_over(&state, &events, Seat::P0, WinReason::Fangs);
    assert_eq!(state.player(Seat::P0).fang, 3);
    // The game ends on the gain, before the attack on the unresolved Seer.
    assert!(!kinds(&events).iter().any(|k| matches!(
        k,
        EventKind::AttackHit { .. } | EventKind::AttackMissed { .. }
    )));
    assert_eq!(state.player(Seat::P1).health, 2);
    assert_eq!(resolved(&events, Seat::P1), 0);
    assert_conserved(&state);
}

#[test]
fn round_end_returns_placed_and_passes_badge() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Villager],
        &[WolfKing, Wolfen, WolfBeauty],
        Witch,
    );
    submit(&mut state, Seat::P0, Villager, &[TargetCard::Fool]);
    submit(&mut state, Seat::P1, WolfBeauty, &[TargetCard::Fool]);
    place(&mut state, Seat::P0, 0);
    let supply_before = state.supply.hourglass;
    let events = place(&mut state, Seat::P1, 1);

    assert_eq!(state.player(Seat::P1).placed, 0);
    assert_eq!(state.player(Seat::P1).hourglass, 0);
    assert_eq!(state.supply.hourglass, supply_before + 1);
    assert_eq!(state.badge, Seat::P1);
    assert_eq!(state.round, 1);
    assert_eq!(state.phase, Phase::RoundOver);
    let tail: Vec<_> = events[events.len() - 2..]
        .iter()
        .map(|e| (&e.visibility, &e.kind))
        .collect();
    assert_eq!(
        tail,
        [
            (
                &Visibility::Public,
                &EventKind::RoundEnded {
                    round: 1,
                    next_badge: Seat::P1,
                }
            ),
            (
                &Visibility::Public,
                &EventKind::DiscardRevealed {
                    round: 1,
                    character: Witch,
                }
            ),
        ]
    );
    assert!(game_over_event(&events).is_none());
    assert_conserved(&state);

    let events = next_round(&mut state, Seat::P0);
    let events = [events, next_round(&mut state, Seat::P1)].concat();
    assert_eq!(state.round, 2);
    assert_eq!(state.phase, Phase::Plan);
    assert_eq!(state.player(Seat::P1).hand.len(), 4);
    assert_eq!(state.player(Seat::P0).hand.len(), 3);
    assert!(state.players.iter().all(|p| p.plan.is_none()));
    assert!(state.showdown.is_none());
    assert!(kinds(&events).contains(&EventKind::RoundStarted {
        round: 2,
        badge: Seat::P1,
    }));
    assert_conserved(&state);
}

fn next_round(state: &mut State, seat: Seat) -> Vec<Event> {
    apply(state, seat, Command::NextRound).expect("next round should be accepted")
}

/// Badge on P0; both play Fool-only plans and place nothing, so round 1 ends quietly.
fn quiet_round_over() -> State {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Villager],
        &[WolfKing, Wolfen, WolfBeauty],
        Witch,
    );
    submit(&mut state, Seat::P0, Knight, &[TargetCard::Fool]);
    submit(&mut state, Seat::P1, Wolfen, &[TargetCard::Fool]);
    place(&mut state, Seat::P0, 0);
    place(&mut state, Seat::P1, 0);
    state
}

#[test]
fn showdown_stops_in_round_over_before_the_deal() {
    let state = quiet_round_over();
    assert_eq!(state.phase, Phase::RoundOver);
    assert!(state.players.iter().all(|p| p.hand.is_empty()));
    assert_eq!(state.discard, None);
    let since_reveal = state
        .log
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::PlansRevealed { .. }))
        .expect("plans were revealed");
    assert!(
        !state.log[since_reveal..]
            .iter()
            .any(|e| matches!(e.kind, EventKind::HandDealt { .. }))
    );
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P0, Seat::P1],
            kind: PendingKind::NextRound,
        }
    );
    for seat in [Seat::P0, Seat::P1] {
        assert_eq!(legal_actions(&state, seat), vec![Command::NextRound]);
    }
}

#[test]
fn next_round_deals_only_when_both_seats_are_ready() {
    let mut state = quiet_round_over();
    let first = next_round(&mut state, Seat::P1);
    assert_eq!(
        kinds(&first),
        vec![EventKind::NextRoundRequested { seat: Seat::P1 }]
    );
    assert_eq!(first[0].visibility, Visibility::Public);
    assert_eq!(state.phase, Phase::RoundOver);
    assert_eq!(state.round, 1);
    assert!(state.players.iter().all(|p| p.hand.is_empty()));
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P0],
            kind: PendingKind::NextRound,
        }
    );
    assert!(legal_actions(&state, Seat::P1).is_empty());

    let second = next_round(&mut state, Seat::P0);
    assert_eq!(
        second[0].kind,
        EventKind::NextRoundRequested { seat: Seat::P0 }
    );
    assert!(
        second
            .iter()
            .any(|e| matches!(e.kind, EventKind::HandDealt { .. }))
    );
    assert_eq!(state.phase, Phase::Plan);
    assert_eq!(state.round, 2);
    assert_eq!(state.next_round_ready, [false; 2]);
    assert!(state.discard.is_some());
}

#[test]
fn duplicate_next_round_is_rejected() {
    let mut state = quiet_round_over();
    next_round(&mut state, Seat::P0);
    let before = state.clone();
    assert_eq!(
        apply(&mut state, Seat::P0, Command::NextRound),
        Err(RuleError::WrongPhase)
    );
    assert_eq!(state, before);
}

#[test]
fn next_round_outside_round_over_is_rejected() {
    let mut state = humans_vs_wolves();
    assert_eq!(
        apply(&mut state, Seat::P0, Command::NextRound),
        Err(RuleError::WrongPhase)
    );
}

/// The current discard, which is forgotten once the round is over.
fn discard_of(state: &State) -> Option<Character> {
    let shown = view(state, Viewer::Omniscient).discard;
    assert_eq!(shown, state.discard, "omniscient sees the discard");
    shown
}

fn json_id(character: Character) -> String {
    serde_json::to_string(&character).unwrap()
}

fn round_start(state: &State) -> u32 {
    let start = state
        .log
        .iter()
        .rposition(|e| matches!(e.kind, EventKind::RoundStarted { .. }))
        .expect("a round has started");
    u32::try_from(start).unwrap()
}

/// Whether the serialised view, or the viewer's events since the round started, name the
/// current discard. Earlier rounds are skipped, since cards dealt or played then may be
/// this round's discard.
fn leaks_discard(state: &State, viewer: Viewer, shown: &View, discard: Option<Character>) -> bool {
    let Some(discard) = discard else {
        return false;
    };
    let events = events_since(state, round_start(state), viewer);
    serde_json::to_string(&(shown, events))
        .unwrap()
        .contains(&json_id(discard))
}

fn revealed_this_round(state: &State) -> bool {
    events_since(state, round_start(state), Viewer::Omniscient)
        .iter()
        .any(|(_, e)| matches!(e.kind, EventKind::PlansRevealed { .. }))
}

fn check_views(state: &State) {
    let revealed = revealed_this_round(state);
    let discard = discard_of(state);
    for seat in [Seat::P0, Seat::P1] {
        let own = view(state, Viewer::Seat(seat));
        let opponent = &own.players[seat.other().index()];
        assert!(opponent.hand.is_none());
        assert_eq!(
            usize::from(opponent.hand_size),
            state.player(seat.other()).hand.len()
        );
        assert_eq!(
            own.players[seat.index()].hand.as_ref(),
            Some(&state.player(seat).hand)
        );
        match (&state.player(seat.other()).plan, &opponent.plan) {
            (None, PlanView::None) => {}
            (Some(plan), PlanView::Hidden { target_count }) if !revealed => {
                assert_eq!(usize::from(*target_count), plan.targets.len());
            }
            (Some(plan), PlanView::Revealed(shown)) if revealed => assert_eq!(plan, shown),
            other => panic!("unexpected opponent plan view {other:?}"),
        }
        if let Some(plan) = &state.player(seat).plan {
            assert_eq!(
                own.players[seat.index()].plan,
                PlanView::Revealed(plan.clone())
            );
        }
        assert_eq!(own.discard, None);
        assert!(!leaks_discard(state, Viewer::Seat(seat), &own, discard));
        assert!(
            !events_since(state, 0, Viewer::Seat(seat))
                .iter()
                .any(|(_, e)| matches!(
                    e.kind,
                    EventKind::HandDealt { seat: s, .. } if s == seat.other()
                ))
        );
        assert_eq!(own.pending, pending(state));
    }

    let spectator = view(state, Viewer::Spectator);
    assert!(spectator.players.iter().all(|p| p.hand.is_none()));
    for seat in [Seat::P0, Seat::P1] {
        match (
            &state.player(seat).plan,
            &spectator.players[seat.index()].plan,
        ) {
            (None, PlanView::None) => {}
            (Some(plan), PlanView::Hidden { target_count }) if !revealed => {
                assert_eq!(usize::from(*target_count), plan.targets.len());
            }
            (Some(plan), PlanView::Revealed(shown)) if revealed => assert_eq!(plan, shown),
            other => panic!("unexpected spectator plan view {other:?}"),
        }
    }
    assert_eq!(spectator.discard, None);
    assert!(
        events_since(state, 0, Viewer::Spectator)
            .iter()
            .all(|(_, e)| e.visibility == Visibility::Public)
    );
    assert!(!leaks_discard(
        state,
        Viewer::Spectator,
        &spectator,
        discard
    ));

    let omniscient = view(state, Viewer::Omniscient);
    let all: Vec<Event> = events_since(state, 0, Viewer::Omniscient)
        .into_iter()
        .map(|(_, e)| e)
        .collect();
    assert_eq!(all, state.log);
    for seat in [Seat::P0, Seat::P1] {
        let shown = &omniscient.players[seat.index()];
        assert_eq!(shown.hand.as_ref(), Some(&state.player(seat).hand));
        if let Some(plan) = &state.player(seat).plan {
            assert_eq!(shown.plan, PlanView::Revealed(plan.clone()));
        }
    }
}

/// Picks a legal command for a pending seat that never names the discarded card.
fn scripted_move(state: &State, step: usize) -> (Seat, Command) {
    let discard = discard_of(state);
    let seat = pending(state).seats[0];
    let actions: Vec<Command> = legal_actions(state, seat)
        .into_iter()
        .filter(|cmd| match cmd {
            Command::SubmitPlan { targets, .. } => {
                !discard.is_some_and(|d| targets.contains(&c(d)))
            }
            Command::ChoosePotionTarget { card } => Some(*card) != discard,
            _ => true,
        })
        .collect();
    (seat, actions[(step * 7) % actions.len()].clone())
}

#[test]
fn view_redaction() {
    let mut state = new_game([7; 32], RulesConfig::default());
    let mut step = 0;
    let mut reveals = 0;
    while state.round <= 3 && !matches!(state.phase, Phase::GameOver { .. }) {
        check_views(&state);
        let (seat, cmd) = scripted_move(&state, step);
        let events = apply(&mut state, seat, cmd).expect("legal actions apply");
        reveals += events
            .iter()
            .filter(|e| matches!(e.kind, EventKind::PlansRevealed { .. }))
            .count();
        step += 1;
    }
    check_views(&state);
    assert_eq!(reveals, 3, "the script should play three full rounds");
}

#[test]
fn visibility_filter() {
    let public = Event {
        visibility: Visibility::Public,
        kind: EventKind::AttackMissed {
            seat: Seat::P0,
            attacker: Character::Knight,
        },
    };
    let private = Event {
        visibility: Visibility::Seat(Seat::P1),
        kind: EventKind::HandDealt {
            seat: Seat::P1,
            cards: vec![Hunter],
        },
    };
    for viewer in [
        Viewer::Seat(Seat::P0),
        Viewer::Seat(Seat::P1),
        Viewer::Spectator,
        Viewer::Omniscient,
    ] {
        assert!(visible_to(&public, viewer));
    }
    assert!(visible_to(&private, Viewer::Seat(Seat::P1)));
    assert!(visible_to(&private, Viewer::Omniscient));
    assert!(!visible_to(&private, Viewer::Seat(Seat::P0)));
    assert!(!visible_to(&private, Viewer::Spectator));
}

#[test]
fn events_since_filters_and_numbers_by_log_index() {
    let config = RulesConfig {
        badge_start: wwd_core::BadgeStart::Seat(Seat::P0),
        ..RulesConfig::default()
    };
    let state = new_game([7; 32], config);
    let seqs = |from, viewer| -> Vec<u32> {
        events_since(&state, from, viewer)
            .into_iter()
            .map(|(seq, _)| seq)
            .collect()
    };
    // Game start, round start, then the Badge holder's hand and the other hand.
    assert_eq!(seqs(0, Viewer::Omniscient), vec![0, 1, 2, 3]);
    assert_eq!(seqs(0, Viewer::Seat(Seat::P0)), vec![0, 1, 2]);
    assert_eq!(seqs(0, Viewer::Seat(Seat::P1)), vec![0, 1, 3]);
    assert_eq!(seqs(0, Viewer::Spectator), vec![0, 1]);
    assert_eq!(seqs(2, Viewer::Seat(Seat::P1)), vec![3]);
    assert!(seqs(4, Viewer::Omniscient).is_empty());
    assert!(seqs(u32::MAX, Viewer::Omniscient).is_empty());
    for (seq, event) in events_since(&state, 0, Viewer::Seat(Seat::P1)) {
        assert_eq!(state.log[seq as usize], event);
    }
}

fn assert_sorted_unique(actions: &[Command]) {
    assert!(actions.windows(2).all(|w| w[0] < w[1]));
}

fn assert_all_apply(state: &State, seat: Seat) {
    let actions = legal_actions(state, seat);
    assert!(!actions.is_empty());
    assert_sorted_unique(&actions);
    for cmd in actions {
        let mut copy = state.clone();
        assert!(
            apply(&mut copy, seat, cmd.clone()).is_ok(),
            "{cmd:?} should apply"
        );
    }
}

#[test]
fn legal_actions_cover_and_validate() {
    let mut state = scenario(
        Seat::P1,
        &[Knight, Seer, Villager],
        &[Hunter, WolfKing, Wolfen, WolfBeauty],
        Witch,
    );
    assert_all_apply(&state, Seat::P0);
    assert_all_apply(&state, Seat::P1);

    let actions = legal_actions(&state, Seat::P0);
    assert!(actions.contains(&Command::SubmitPlan {
        character: Villager,
        targets: vec![TargetCard::Fool],
    }));
    assert!(!actions.contains(&Command::SubmitPlan {
        character: Villager,
        targets: vec![],
    }));
    assert!(actions.contains(&Command::SubmitPlan {
        character: Knight,
        targets: vec![c(Wolfen), TargetCard::Fool],
    }));
    assert!(!actions.iter().any(|cmd| matches!(
        cmd,
        Command::SubmitPlan { character, .. } if !state.player(Seat::P0).hand.contains(character)
    )));
    // Knight and Seer: 3 werewolves, each alone or with the Fool, or the Fool alone. Villager: Fool.
    assert_eq!(actions.len(), 7 + 7 + 1);

    let wolf_king_plans = legal_actions(&state, Seat::P1)
        .into_iter()
        .filter(|cmd| {
            matches!(
                cmd,
                Command::SubmitPlan {
                    character: WolfKing,
                    ..
                }
            )
        })
        .count();
    // Any non-empty subset of the four humans outside the hand and the Fool.
    assert_eq!(wolf_king_plans, (1 << 5) - 1);
    assert_eq!(
        legal_actions(&state, Seat::P0),
        legal_actions(&state.clone(), Seat::P0)
    );

    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]);
    assert!(legal_actions(&state, Seat::P0).is_empty());
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P1],
            kind: PendingKind::Plan,
        }
    );
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);

    assert_eq!(state.phase, Phase::RevealHourglass { seat: Seat::P1 });
    assert!(legal_actions(&state, Seat::P0).is_empty());
    place(&mut state, Seat::P1, 0);
    assert_eq!(state.phase, Phase::RevealHourglass { seat: Seat::P0 });
    assert!(legal_actions(&state, Seat::P1).is_empty());
    assert_eq!(
        legal_actions(&state, Seat::P0),
        vec![
            Command::PlaceHourglasses { n: 0 },
            Command::PlaceHourglasses { n: 1 },
        ]
    );
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P0],
            kind: PendingKind::PlaceHourglasses,
        }
    );
    assert_all_apply(&state, Seat::P0);
}

#[test]
fn legal_actions_min_targets_zero_allow_no_targets() {
    let config = RulesConfig {
        min_targets: MinTargets::Zero,
        badge_start: wwd_core::BadgeStart::Seat(Seat::P1),
        ..RulesConfig::default()
    };
    let mut state = new_game([0; 32], config);
    edit(
        &mut state,
        Edit::SetHands {
            hands: [
                vec![Knight, Seer, Villager],
                vec![Hunter, WolfKing, Wolfen, WolfBeauty],
            ],
            discard: Witch,
        },
    );
    let actions = legal_actions(&state, Seat::P0);
    assert!(actions.contains(&Command::SubmitPlan {
        character: Villager,
        targets: vec![],
    }));
    assert_eq!(actions.len(), 8 + 8 + 2);
    assert_all_apply(&state, Seat::P0);
}

#[test]
fn legal_actions_for_potion_and_hunter() {
    let mut state = scenario(
        Seat::P0,
        &[Hunter, Knight, Seer, Witch],
        &[WolfKing, Wolfen, WolfBeauty],
        Villager,
    );
    edit(
        &mut state,
        Edit::SetPotion {
            seat: Some(Seat::P0),
        },
    );
    submit(&mut state, Seat::P0, Hunter, &[c(Wolfen), c(WolfBeauty)]);
    submit(&mut state, Seat::P1, WolfBeauty, &[c(Seer)]);
    place(&mut state, Seat::P0, 0);
    place(&mut state, Seat::P1, 0);
    assert_eq!(state.phase, Phase::RevealPotion { seat: Seat::P0 });
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P0],
            kind: PendingKind::ChoosePotionTarget,
        }
    );
    assert!(legal_actions(&state, Seat::P1).is_empty());
    let expected: Vec<Command> = Character::ALL
        .into_iter()
        .filter(|card| !state.player(Seat::P0).dealt.contains(card))
        .map(|card| Command::ChoosePotionTarget { card })
        .collect();
    assert_eq!(legal_actions(&state, Seat::P0), expected);
    assert_all_apply(&state, Seat::P0);

    apply(
        &mut state,
        Seat::P0,
        Command::ChoosePotionTarget { card: WolfKing },
    )
    .unwrap();
    assert_eq!(state.phase, Phase::HunterChoice { seat: Seat::P0 });
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P0],
            kind: PendingKind::HunterChoice,
        }
    );
    assert!(legal_actions(&state, Seat::P1).is_empty());
    assert_eq!(
        legal_actions(&state, Seat::P0),
        vec![
            Command::HunterSpendCross { spend: false },
            Command::HunterSpendCross { spend: true },
        ]
    );
    assert_all_apply(&state, Seat::P0);
}

#[test]
fn nothing_is_legal_after_game_over() {
    let mut state = humans_vs_wolves();
    edit(
        &mut state,
        Edit::SetHealth {
            seat: Seat::P1,
            n: 1,
        },
    );
    submit(&mut state, Seat::P0, Knight, &[c(Wolfen)]);
    submit(&mut state, Seat::P1, Wolfen, &[c(Knight)]);
    place(&mut state, Seat::P0, 0);
    place(&mut state, Seat::P1, 0);
    assert_eq!(
        state.phase,
        Phase::GameOver {
            winner: Seat::P0,
            reason: WinReason::Health,
        }
    );
    assert!(legal_actions(&state, Seat::P0).is_empty());
    assert!(legal_actions(&state, Seat::P1).is_empty());
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![],
            kind: PendingKind::None,
        }
    );
    // Both plans stay revealed to each seat once the game is over.
    let shown = view(&state, Viewer::Seat(Seat::P0));
    assert!(matches!(shown.players[1].plan, PlanView::Revealed(_)));
    assert_eq!(shown.phase, state.phase);
}

#[test]
fn pending_in_plan_lists_both_seats() {
    let state = humans_vs_wolves();
    assert_eq!(
        pending(&state),
        Pending {
            seats: vec![Seat::P0, Seat::P1],
            kind: PendingKind::Plan,
        }
    );
    let shown = view(&state, Viewer::Seat(Seat::P0));
    assert_eq!(shown.round, 1);
    assert_eq!(shown.badge, Seat::P0);
    assert_eq!(shown.viewer, Viewer::Seat(Seat::P0));
    assert_eq!(shown.supply, state.supply);
    assert_eq!(shown.players[1].plan, PlanView::None);
    assert_eq!(shown.players[1].hand_size, 3);
    assert_eq!(shown.players[0].hand_size, 4);
}
