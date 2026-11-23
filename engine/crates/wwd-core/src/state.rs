use serde::{Deserialize, Serialize};

use crate::event::Event;
use crate::hash::hash_bytes;
use crate::rng::RngState;
use crate::types::{Character, Plan, RulesConfig, Seat};

pub const TOTAL_CROSS: u8 = 7;
pub const TOTAL_FANG: u8 = 5;
pub const TOTAL_HOURGLASS: u8 = 5;
pub const START_HEALTH: u8 = 2;
pub const WIN_CROSS: u8 = 4;
pub const WIN_FANG: u8 = 3;
pub const BADGE_HAND_SIZE: usize = 4;
pub const OTHER_HAND_SIZE: usize = 3;

/// Markers not held by either player.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Supply {
    pub cross: u8,
    pub fang: u8,
    pub hourglass: u8,
    pub potion: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlayerState {
    pub health: u8,
    pub cross: u8,
    pub fang: u8,
    /// Hourglasses held in reserve.
    pub hourglass: u8,
    /// Hourglasses placed on the character card this round.
    pub placed: u8,
    pub potion: bool,
    /// Sorted by initiative.
    pub hand: Vec<Character>,
    pub plan: Option<Plan>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum WinReason {
    Health,
    Fangs,
    Crosses,
    Resignation,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    /// Both seats may submit while their plan is `None`.
    Plan,
    RevealHourglass {
        seat: Seat,
    },
    RevealPotion {
        seat: Seat,
    },
    HunterChoice {
        seat: Seat,
    },
    /// The round is over and nothing is dealt; each seat confirms the next round.
    RoundOver,
    GameOver {
        winner: Seat,
        reason: WinReason,
    },
}

/// The card a Potion holder named, publicly, during the reveal.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct PotionTarget {
    pub holder: Seat,
    pub card: Character,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Showdown {
    pub order: [Seat; 2],
    pub next: u8,
    pub resolved: [bool; 2],
    pub eliminated: [bool; 2],
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct State {
    pub engine_version: String,
    pub config: RulesConfig,
    pub rng: RngState,
    pub round: u32,
    pub badge: Seat,
    pub players: [PlayerState; 2],
    pub supply: Supply,
    pub discard: Option<Character>,
    pub potion_target: Option<PotionTarget>,
    pub showdown: Option<Showdown>,
    pub phase: Phase,
    /// Seats that have asked for the next round in [`Phase::RoundOver`], by seat index.
    pub next_round_ready: [bool; 2],
    pub log: Vec<Event>,
    pub tainted: bool,
}

impl State {
    pub fn player(&self, seat: Seat) -> &PlayerState {
        &self.players[seat.index()]
    }

    pub fn player_mut(&mut self, seat: Seat) -> &mut PlayerState {
        &mut self.players[seat.index()]
    }
}

/// Hashes the full state, including the log.
pub fn hash(state: &State) -> [u8; 32] {
    hash_bytes(state)
}
