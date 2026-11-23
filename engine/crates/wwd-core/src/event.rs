use serde::{Deserialize, Serialize};

use crate::state::WinReason;
use crate::types::{Character, Plan, RulesConfig, Seat};

/// Who may see an event.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Visibility {
    Public,
    Seat(Seat),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Event {
    pub visibility: Visibility,
    pub kind: EventKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    GameStarted {
        config: RulesConfig,
        #[serde(with = "crate::hex")]
        #[cfg_attr(feature = "ts", ts(type = "string"))]
        seed_commitment: [u8; 32],
    },
    RoundStarted {
        round: u32,
        badge: Seat,
    },
    HandDealt {
        seat: Seat,
        cards: Vec<Character>,
    },
    /// A sealed plan; only the number of target cards is disclosed.
    PlanSubmitted {
        seat: Seat,
        target_count: u8,
    },
    HourglassesPlaced {
        seat: Seat,
        n: u8,
    },
    PotionTargetChosen {
        seat: Seat,
        card: Character,
    },
    /// Both plans, indexed by seat, with effective initiatives and resolution order.
    PlansRevealed {
        plans: [Plan; 2],
        effective: [u8; 2],
        order: [Seat; 2],
    },
    /// The Potion naming `target` resolves against `victim`, the holder's opponent;
    /// `health_lost` is 0 on a miss.
    PotionResolved {
        target: Character,
        victim: Seat,
        hit: bool,
        health_lost: u8,
    },
    CharacterResolved {
        seat: Seat,
        character: Character,
    },
    MarkerGained {
        seat: Seat,
        marker: Marker,
        from_opponent: bool,
    },
    /// Markers returned to the supply.
    MarkerSpent {
        seat: Seat,
        marker: Marker,
        n: u8,
    },
    /// `health_lost` is the Health actually removed, after clamping at zero.
    AttackHit {
        seat: Seat,
        target_seat: Seat,
        character: Character,
        health_lost: u8,
    },
    AttackMissed {
        seat: Seat,
    },
    AttackForfeited {
        seat: Seat,
        reason: ForfeitReason,
    },
    /// `round` is the round that ended; `next_badge` holds the Badge for the next round.
    RoundEnded {
        round: u32,
        next_badge: Seat,
    },
    /// A seat is ready for the next round, which is dealt once both are.
    NextRoundRequested {
        seat: Seat,
    },
    GameOver {
        winner: Seat,
        reason: WinReason,
    },
    /// A seat concedes; always followed by `GameOver`.
    Resigned {
        seat: Seat,
    },
}

impl EventKind {
    /// The localisation message ID for this kind of event.
    pub fn id(&self) -> &'static str {
        match self {
            EventKind::GameStarted { .. } => "event-game-started",
            EventKind::RoundStarted { .. } => "event-round-started",
            EventKind::HandDealt { .. } => "event-hand-dealt",
            EventKind::PlanSubmitted { .. } => "event-plan-submitted",
            EventKind::HourglassesPlaced { .. } => "event-hourglasses-placed",
            EventKind::PotionTargetChosen { .. } => "event-potion-target-chosen",
            EventKind::PlansRevealed { .. } => "event-plans-revealed",
            EventKind::PotionResolved { .. } => "event-potion-resolved",
            EventKind::CharacterResolved { .. } => "event-character-resolved",
            EventKind::MarkerGained { .. } => "event-marker-gained",
            EventKind::MarkerSpent { .. } => "event-marker-spent",
            EventKind::AttackHit { .. } => "event-attack-hit",
            EventKind::AttackMissed { .. } => "event-attack-missed",
            EventKind::AttackForfeited { .. } => "event-attack-forfeited",
            EventKind::RoundEnded { .. } => "event-round-ended",
            EventKind::NextRoundRequested { .. } => "event-next-round-requested",
            EventKind::Resigned { .. } => "event-resigned",
            EventKind::GameOver { .. } => "event-game-over",
        }
    }
}

/// A kind of marker that can be gained or spent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Marker {
    Cross,
    Fang,
    Hourglass,
    Potion,
}

/// Why a character made no attack.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum ForfeitReason {
    NoCross,
    Declined,
    CannotPayFangs,
    NoTargets,
}
