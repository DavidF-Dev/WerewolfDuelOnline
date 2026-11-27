use std::collections::BTreeSet;

use crate::command::Command;
use crate::state::{Phase, State};
use crate::targeting::{attack_rule, may_target, validate_plan};
use crate::types::{Character, Plan, RulesConfig, Seat, TargetCard};

/// Every command `seat` may issue now, sorted and without duplicates. Each accepted plan
/// appears once, as a single canonical command with its targets sorted. Empty when it is
/// not this seat's turn or the game is over.
pub fn legal_actions(state: &State, seat: Seat) -> Vec<Command> {
    let mut actions = match state.phase {
        Phase::Plan => match state.player(seat).plan {
            None => plan_actions(&state.player(seat).hand, &state.config),
            Some(_) => Vec::new(),
        },
        Phase::RevealHourglass { seat: turn } if turn == seat => (0..=state.player(seat).hourglass)
            .map(|n| Command::PlaceHourglasses { n })
            .collect(),
        Phase::RevealPotion { seat: turn } if turn == seat => {
            let dealt = &state.player(seat).dealt;
            Character::ALL
                .into_iter()
                .filter(|card| !dealt.contains(card))
                .map(|card| Command::ChoosePotionTarget { card })
                .collect()
        }
        Phase::HunterChoice { seat: turn } if turn == seat => [false, true]
            .into_iter()
            .map(|spend| Command::HunterSpendCross { spend })
            .collect(),
        Phase::RoundOver if !state.next_round_ready[seat.index()] => vec![Command::NextRound],
        Phase::RoundOver
        | Phase::RevealHourglass { .. }
        | Phase::RevealPotion { .. }
        | Phase::HunterChoice { .. }
        | Phase::GameOver { .. } => Vec::new(),
    };
    actions.sort();
    actions.dedup();
    actions
}

/// Whether `seat` may resign: any time before the game is over. Resignation is never
/// listed by [`legal_actions`].
pub fn can_resign(state: &State, _seat: Seat) -> bool {
    !matches!(state.phase, Phase::GameOver { .. })
}

/// Every plan from `hand` that passes validation: each subset of the character's
/// allowed target cards outside `hand`, plus the Fool.
fn plan_actions(hand: &[Character], config: &RulesConfig) -> Vec<Command> {
    let mut actions = Vec::new();
    for &character in hand {
        let candidates: Vec<TargetCard> = Character::ALL
            .into_iter()
            .filter(|&target| may_target(attack_rule(character), target) && !hand.contains(&target))
            .map(TargetCard::Character)
            .chain(std::iter::once(TargetCard::Fool))
            .collect();
        for mask in 0u16..1 << candidates.len() {
            let targets: BTreeSet<TargetCard> = candidates
                .iter()
                .enumerate()
                .filter(|&(i, _)| mask & (1 << i) != 0)
                .map(|(_, &target)| target)
                .collect();
            let plan = Plan { character, targets };
            if validate_plan(&plan, config).is_ok() {
                actions.push(Command::SubmitPlan {
                    character,
                    targets: plan.targets.into_iter().collect(),
                });
            }
        }
    }
    actions
}
