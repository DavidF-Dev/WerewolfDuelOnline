use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use crate::event::Marker;
use crate::showdown::{asks_owner, cost, damage, gain};
use crate::types::{Character, Faction, Plan, RuleError, RulesConfig, TargetCard};

/// Which non-Fool cards a character may target, and how many.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AttackRule {
    None,
    Werewolves { max: u8 },
    Humans { max: Option<u8> },
    Any { max: u8 },
}

pub fn attack_rule(c: Character) -> AttackRule {
    match c {
        Character::Hunter => AttackRule::Werewolves { max: 2 },
        Character::WolfKing => AttackRule::Humans { max: None },
        Character::Knight | Character::Seer => AttackRule::Werewolves { max: 1 },
        Character::Wolfen | Character::WolfBeauty => AttackRule::Any { max: 1 },
        Character::Witch | Character::Villager => AttackRule::None,
    }
}

/// What a character must spend for its attack to be made.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Cost {
    /// One of the marker.
    One(Marker),
    /// One of the marker for each character target after the first; short of that, it
    /// pays nothing and makes no attack.
    PerExtraTarget(Marker),
}

/// The character targets an attack may name.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AttackShape {
    /// The faction targets must belong to; `None` for any.
    pub faction: Option<Faction>,
    /// The most character targets; `None` for any number.
    pub max: Option<u8>,
}

/// What a character does when it resolves, for showing its ability.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct AbilitySummary {
    /// Markers gained before attacking.
    pub gains: Vec<Marker>,
    pub spends: Option<Cost>,
    /// `None` when the character never attacks.
    pub attack: Option<AttackShape>,
    /// Health a hit removes; 0 without an attack.
    pub damage: u8,
    /// Whether the owner chooses whether to spend the Cross in `spends`.
    pub optional_cross: bool,
}

/// The ability of `c`, taken from its targeting rule and its showdown effects.
pub fn ability_summary(c: Character) -> AbilitySummary {
    let attack = match attack_rule(c) {
        AttackRule::None => None,
        AttackRule::Werewolves { max } => Some(AttackShape {
            faction: Some(Faction::Werewolf),
            max: Some(max),
        }),
        AttackRule::Humans { max } => Some(AttackShape {
            faction: Some(Faction::Human),
            max,
        }),
        AttackRule::Any { max } => Some(AttackShape {
            faction: None,
            max: Some(max),
        }),
    };
    AbilitySummary {
        gains: gain(c).into_iter().collect(),
        spends: cost(c),
        damage: if attack.is_some() { damage(c) } else { 0 },
        attack,
        optional_cross: asks_owner(c),
    }
}

/// Whether `rule` allows `target` as a non-Fool target card, ignoring the count limit.
pub(crate) fn may_target(rule: AttackRule, target: Character) -> bool {
    match rule {
        AttackRule::None => false,
        AttackRule::Werewolves { .. } => target.faction() == Faction::Werewolf,
        AttackRule::Humans { .. } => target.faction() == Faction::Human,
        AttackRule::Any { .. } => true,
    }
}

pub fn validate_plan(plan: &Plan, config: &RulesConfig) -> Result<(), RuleError> {
    let rule = attack_rule(plan.character);
    let mut count: usize = 0;
    for target in &plan.targets {
        let TargetCard::Character(character) = target else {
            continue;
        };
        if !may_target(rule, *character) {
            return Err(RuleError::TargetNotAllowed);
        }
        count += 1;
    }

    let max = match rule {
        AttackRule::None => Some(0),
        AttackRule::Werewolves { max } | AttackRule::Any { max } => Some(max as usize),
        AttackRule::Humans { max } => max.map(usize::from),
    };
    if max.is_some_and(|m| count > m) {
        return Err(RuleError::TooManyTargets);
    }
    if plan.targets.len() < config.min_targets.count() {
        return Err(RuleError::TooFewTargets);
    }
    Ok(())
}

/// Whether any of `targets` names a character in `hand`. The Fool is never in a hand.
pub(crate) fn targets_in_hand(targets: &BTreeSet<TargetCard>, hand: &[Character]) -> bool {
    targets
        .iter()
        .any(|target| matches!(target, TargetCard::Character(c) if hand.contains(c)))
}
