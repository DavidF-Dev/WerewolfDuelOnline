#![cfg(feature = "unsafe-edit")]

mod common;

use common::scenario;
use wwd_core::Character::*;
use wwd_core::{
    AbilitySummary, AttackShape, Character, Command, Cost, Edit, EventKind, Faction, Marker, Phase,
    Plan, RulesConfig, Seat, State, TargetCard, ability_summary, apply, apply_edit, validate_plan,
};

/// The table in spec §5.3 step 4, together with the allowed targets in step 2.
fn spec_table(character: Character) -> AbilitySummary {
    let attack = |faction, max| Some(AttackShape { faction, max });
    let werewolves = Some(Faction::Werewolf);
    let (gains, spends, attack, damage, optional_cross) = match character {
        Hunter => (
            vec![],
            Some(Cost::One(Marker::Cross)),
            attack(werewolves, Some(2)),
            1,
            true,
        ),
        WolfKing => (
            vec![],
            Some(Cost::PerExtraTarget(Marker::Fang)),
            attack(Some(Faction::Human), None),
            1,
            false,
        ),
        Knight => (
            vec![Marker::Hourglass],
            None,
            attack(werewolves, Some(1)),
            1,
            false,
        ),
        Wolfen => (
            vec![Marker::Hourglass],
            None,
            attack(None, Some(1)),
            1,
            false,
        ),
        Seer => (vec![], None, attack(werewolves, Some(1)), 2, false),
        Witch => (vec![Marker::Potion], None, None, 0, false),
        WolfBeauty => (vec![Marker::Fang], None, attack(None, Some(1)), 1, false),
        Villager => (vec![Marker::Cross], None, None, 0, false),
    };
    AbilitySummary {
        gains,
        spends,
        attack,
        damage,
        optional_cross,
    }
}

fn allows(character: Character, targets: &[Character]) -> bool {
    let plan = Plan {
        character,
        targets: targets.iter().map(|&c| TargetCard::Character(c)).collect(),
    };
    validate_plan(&plan, &RulesConfig::default()).is_ok()
}

/// The attack shape found by asking `validate_plan` which targets it accepts.
fn probed_attack(character: Character) -> Option<AttackShape> {
    let allowed: Vec<Character> = Character::ALL
        .into_iter()
        .filter(|&t| allows(character, &[t]))
        .collect();
    if allowed.is_empty() {
        return None;
    }
    let faction = [Faction::Human, Faction::Werewolf]
        .into_iter()
        .find(|&f| allowed.iter().all(|c| c.faction() == f));
    let max = (1..=allowed.len())
        .take_while(|&k| allows(character, &allowed[..k]))
        .last()
        .expect("one allowed target is accepted");
    let max = (max < allowed.len()).then(|| u8::try_from(max).unwrap());
    Some(AttackShape { faction, max })
}

/// The character P1 plays: one that resolves after `character` and that it may attack, or
/// the Wolf Beauty when there is none.
fn victim_for(character: Character) -> Character {
    if character != Villager && allows(character, &[Villager]) {
        Villager
    } else {
        WolfBeauty
    }
}

/// A round dealt so that P0 holds `character` and `extra`, and P1 holds `victim`.
fn deal(character: Character, victim: Character, extra: &[Character]) -> State {
    let mut spare = Character::ALL
        .into_iter()
        .filter(|&c| c != character && c != victim && !extra.contains(&c));
    let mut p0 = vec![character];
    p0.extend(extra);
    p0.extend(spare.by_ref().take(4 - p0.len()));
    let mut p1 = vec![victim];
    p1.extend(spare.by_ref().take(2));
    let discard = spare.next().expect("one card is left over");
    scenario(Seat::P0, &p0, &p1, discard)
}

/// Plays a round where P0 plays `character` at `targets` and P1 plays `victim` at the Fool,
/// spending the Cross if asked. Returns whether P0 was asked, and the events from P0's
/// character resolving until the next character does or the game ends.
fn resolve(
    state: &mut State,
    character: Character,
    targets: Vec<TargetCard>,
    victim: Character,
) -> (bool, Vec<EventKind>) {
    let plans = [
        (Seat::P0, character, targets),
        (Seat::P1, victim, vec![TargetCard::Fool]),
    ];
    for (seat, character, targets) in plans {
        apply(state, seat, Command::SubmitPlan { character, targets }).unwrap();
    }
    let mut events = Vec::new();
    for seat in [Seat::P0, Seat::P1] {
        events.extend(apply(state, seat, Command::PlaceHourglasses { n: 0 }).unwrap());
    }
    let asked = state.phase == (Phase::HunterChoice { seat: Seat::P0 });
    if asked {
        events.extend(apply(state, Seat::P0, Command::HunterSpendCross { spend: true }).unwrap());
    }
    let start = events
        .iter()
        .position(|e| matches!(e.kind, EventKind::CharacterResolved { seat: Seat::P0, .. }))
        .expect("P0's character resolves");
    let end = events[start + 1..]
        .iter()
        .position(|e| matches!(e.kind, EventKind::CharacterResolved { .. }))
        .map_or(events.len(), |i| start + 1 + i);
    let kinds = events[start..end].iter().map(|e| e.kind.clone()).collect();
    (asked, kinds)
}

/// The single marker P0 spent among `events`, if any.
fn spent(events: &[EventKind]) -> Option<Marker> {
    events.iter().find_map(|k| match k {
        EventKind::MarkerSpent {
            seat: Seat::P0,
            marker,
            n: 1,
        } => Some(*marker),
        _ => None,
    })
}

/// What a second character target costs, found by attacking two with two Fangs in hand.
fn extra_target_cost(character: Character, victim: Character) -> Option<Cost> {
    let second = Character::ALL
        .into_iter()
        .find(|&c| c != character && c != victim && allows(character, &[victim, c]))?;
    let mut state = deal(character, victim, &[second]);
    apply_edit(
        &mut state,
        Edit::SetFang {
            seat: Seat::P0,
            n: 2,
        },
    )
    .unwrap();
    let targets = vec![TargetCard::Character(victim), TargetCard::Character(second)];
    let (_, events) = resolve(&mut state, character, targets, victim);
    spent(&events).map(Cost::PerExtraTarget)
}

/// The summary found by resolving `character` in a showdown, with its targets probed
/// through `validate_plan`.
fn observed(character: Character) -> AbilitySummary {
    let attack = probed_attack(character);
    let victim = victim_for(character);
    let target = if attack.is_some() {
        TargetCard::Character(victim)
    } else {
        TargetCard::Fool
    };
    let mut state = deal(character, victim, &[]);
    let (asked, events) = resolve(&mut state, character, vec![target], victim);
    let gains = events
        .iter()
        .filter_map(|k| match k {
            EventKind::MarkerGained {
                seat: Seat::P0,
                marker,
                ..
            } => Some(*marker),
            _ => None,
        })
        .collect();
    let damage = events
        .iter()
        .find_map(|k| match k {
            EventKind::AttackHit { health_lost, .. } => Some(*health_lost),
            _ => None,
        })
        .unwrap_or(0);
    let several_targets = attack.is_some_and(|a| a.max.is_none_or(|m| m > 1));
    let spends = match spent(&events) {
        Some(marker) => Some(Cost::One(marker)),
        None if several_targets => extra_target_cost(character, victim),
        None => None,
    };
    AbilitySummary {
        gains,
        spends,
        attack,
        damage,
        optional_cross: asked,
    }
}

#[test]
fn ability_summary_agrees_with_the_rules() {
    for character in Character::ALL {
        let summary = ability_summary(character);
        assert_eq!(
            summary,
            spec_table(character),
            "{character:?} against the spec"
        );
        assert_eq!(summary, observed(character), "{character:?} in play");
    }
}
