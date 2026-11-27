use serde::{Deserialize, Serialize};

use crate::types::{Character, TargetCard};

/// A player's input to the rules engine.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Command {
    /// Seals a character from hand and its target cards; duplicates are rejected.
    SubmitPlan {
        character: Character,
        targets: Vec<TargetCard>,
    },
    /// Places `n` Hourglasses from reserve onto the planned character.
    PlaceHourglasses { n: u8 },
    /// Names a character not dealt to this seat this round as the Potion target.
    ChoosePotionTarget { card: Character },
    /// Answers whether the Hunter spends a Cross to attack.
    HunterSpendCross { spend: bool },
    /// Confirms that the next round may be dealt.
    NextRound,
    /// Concedes the game; valid in any phase except game over, and never offered by
    /// `legal_actions`.
    Resign,
}
