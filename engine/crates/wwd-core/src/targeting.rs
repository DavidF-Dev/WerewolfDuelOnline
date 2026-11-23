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
