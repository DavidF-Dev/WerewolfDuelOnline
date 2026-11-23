use std::collections::BTreeSet;
use std::fmt;

use serde::{Deserialize, Serialize};

/// A character card, declared in initiative order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Character {
    Hunter,
    WolfKing,
    Knight,
    Wolfen,
    Seer,
    Witch,
    WolfBeauty,
    Villager,
}

impl Character {
    pub const ALL: [Character; 8] = [
        Character::Hunter,
        Character::WolfKing,
        Character::Knight,
        Character::Wolfen,
        Character::Seer,
        Character::Witch,
        Character::WolfBeauty,
        Character::Villager,
    ];

    /// Resolution order, from 1 (first) to 8 (last).
    pub fn initiative(self) -> u8 {
        self as u8 + 1
    }

    pub fn faction(self) -> Faction {
        match self {
            Character::WolfKing | Character::Wolfen | Character::WolfBeauty => Faction::Werewolf,
            _ => Faction::Human,
        }
    }

    /// The localisation message ID for this character.
    pub fn id(self) -> &'static str {
        match self {
            Character::Hunter => "character-hunter",
            Character::WolfKing => "character-wolf-king",
            Character::Knight => "character-knight",
            Character::Wolfen => "character-wolfen",
            Character::Seer => "character-seer",
            Character::Witch => "character-witch",
            Character::WolfBeauty => "character-wolf-beauty",
            Character::Villager => "character-villager",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Faction {
    Human,
    Werewolf,
}

impl Faction {
    /// The localisation message ID for this faction.
    pub fn id(self) -> &'static str {
        match self {
            Faction::Human => "faction-human",
            Faction::Werewolf => "faction-werewolf",
        }
    }
}

/// A card a plan can target. Orders characters by initiative, with the Fool last.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum TargetCard {
    Character(Character),
    Fool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "lowercase")]
pub enum Seat {
    P0,
    P1,
}

impl Seat {
    pub fn other(self) -> Seat {
        match self {
            Seat::P0 => Seat::P1,
            Seat::P1 => Seat::P0,
        }
    }

    pub fn index(self) -> usize {
        match self {
            Seat::P0 => 0,
            Seat::P1 => 1,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Tiebreak {
    HourglassesThenBadge,
    BadgeOnly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum BadgeStart {
    Random,
    Seat(Seat),
}

/// The fewest target cards a plan may have. Serialises as the number `0` or `1`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[cfg_attr(feature = "ts", ts(type = "0 | 1"))]
#[serde(try_from = "u8", into = "u8")]
pub enum MinTargets {
    Zero,
    One,
}

impl MinTargets {
    pub fn count(self) -> usize {
        usize::from(u8::from(self))
    }
}

impl From<MinTargets> for u8 {
    fn from(min: MinTargets) -> Self {
        match min {
            MinTargets::Zero => 0,
            MinTargets::One => 1,
        }
    }
}

impl TryFrom<u8> for MinTargets {
    type Error = InvalidMinTargets;

    fn try_from(n: u8) -> Result<Self, InvalidMinTargets> {
        match n {
            0 => Ok(MinTargets::Zero),
            1 => Ok(MinTargets::One),
            _ => Err(InvalidMinTargets(n)),
        }
    }
}

/// A minimum target count other than 0 or 1.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InvalidMinTargets(pub u8);

impl fmt::Display for InvalidMinTargets {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "min_targets must be 0 or 1, not {}", self.0)
    }
}

impl std::error::Error for InvalidMinTargets {}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct RulesConfig {
    pub tiebreak: Tiebreak,
    pub min_targets: MinTargets,
    pub badge_start: BadgeStart,
}

impl Default for RulesConfig {
    fn default() -> Self {
        Self {
            tiebreak: Tiebreak::HourglassesThenBadge,
            min_targets: MinTargets::One,
            badge_start: BadgeStart::Random,
        }
    }
}

/// A character played together with the cards it targets.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Plan {
    pub character: Character,
    pub targets: BTreeSet<TargetCard>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum RuleError {
    GameOver,
    NotYourTurn,
    WrongPhase,
    CharacterNotInHand,
    TargetNotAllowed,
    TooManyTargets,
    TooFewTargets,
    NotEnoughHourglasses,
    InvalidPotionTarget,
}

impl RuleError {
    /// The localisation message ID for this error.
    pub fn id(self) -> &'static str {
        match self {
            RuleError::GameOver => "error-game-over",
            RuleError::NotYourTurn => "error-not-your-turn",
            RuleError::WrongPhase => "error-wrong-phase",
            RuleError::CharacterNotInHand => "error-character-not-in-hand",
            RuleError::TargetNotAllowed => "error-target-not-allowed",
            RuleError::TooManyTargets => "error-too-many-targets",
            RuleError::TooFewTargets => "error-too-few-targets",
            RuleError::NotEnoughHourglasses => "error-not-enough-hourglasses",
            RuleError::InvalidPotionTarget => "error-invalid-potion-target",
        }
    }
}

impl fmt::Display for RuleError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.id())
    }
}

impl std::error::Error for RuleError {}
