use std::fmt;

use serde::{Deserialize, Serialize};

use crate::types::{Character, Seat};

/// A direct state change that bypasses the rules; marks the state tainted.
///
/// The type is always available so replay files deserialise everywhere; applying an edit
/// requires the `unsafe-edit` feature.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Edit {
    SetHealth {
        seat: Seat,
        n: u8,
    },
    SetCross {
        seat: Seat,
        n: u8,
    },
    SetFang {
        seat: Seat,
        n: u8,
    },
    /// Sets the unplaced reserve only.
    SetHourglass {
        seat: Seat,
        n: u8,
    },
    /// Moves the potion to a seat, or to the supply for `None`.
    SetPotion {
        seat: Option<Seat>,
    },
    SetBadge {
        seat: Seat,
    },
    /// Only valid in the plan phase with no plans submitted.
    SetHands {
        hands: [Vec<Character>; 2],
        discard: Character,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum EditError {
    WrongPhase,
    SupplyExceeded,
    InvalidHands,
    /// The edit would win or lose the game outright.
    WouldEndGame,
}

impl EditError {
    /// The localisation message ID for this error.
    pub fn id(self) -> &'static str {
        match self {
            EditError::WrongPhase => "error-edit-wrong-phase",
            EditError::SupplyExceeded => "error-edit-supply-exceeded",
            EditError::InvalidHands => "error-edit-invalid-hands",
            EditError::WouldEndGame => "error-edit-would-end-game",
        }
    }
}

impl fmt::Display for EditError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.id())
    }
}

impl std::error::Error for EditError {}

#[cfg(feature = "unsafe-edit")]
/// Moves a marker count between a player and the supply, keeping the total.
fn move_markers(held: &mut u8, supply: &mut u8, n: u8) -> Result<(), EditError> {
    let new_supply = i16::from(*supply) + i16::from(*held) - i16::from(n);
    let new_supply = u8::try_from(new_supply).map_err(|_| EditError::SupplyExceeded)?;
    *held = n;
    *supply = new_supply;
    Ok(())
}

/// Whether `edit` sets a value that ends the game, which only a rule-driven change may do.
#[cfg(feature = "unsafe-edit")]
fn would_end_game(edit: &Edit) -> bool {
    use crate::state::{WIN_CROSS, WIN_FANG};

    match *edit {
        Edit::SetHealth { n, .. } => n == 0,
        Edit::SetCross { n, .. } => n >= WIN_CROSS,
        Edit::SetFang { n, .. } => n >= WIN_FANG,
        Edit::SetHourglass { .. }
        | Edit::SetPotion { .. }
        | Edit::SetBadge { .. }
        | Edit::SetHands { .. } => false,
    }
}

/// Applies `edit` directly, bypassing the rules, and marks the state tainted.
#[cfg(feature = "unsafe-edit")]
pub fn apply_edit(state: &mut crate::state::State, edit: Edit) -> Result<(), EditError> {
    use crate::state::{BADGE_HAND_SIZE, OTHER_HAND_SIZE, Phase};
    use std::collections::BTreeSet;

    if would_end_game(&edit) {
        return Err(EditError::WouldEndGame);
    }
    match edit {
        Edit::SetHealth { seat, n } => state.player_mut(seat).health = n,
        Edit::SetCross { seat, n } => {
            let player = &mut state.players[seat.index()];
            move_markers(&mut player.cross, &mut state.supply.cross, n)?;
        }
        Edit::SetFang { seat, n } => {
            let player = &mut state.players[seat.index()];
            move_markers(&mut player.fang, &mut state.supply.fang, n)?;
        }
        Edit::SetHourglass { seat, n } => {
            let player = &mut state.players[seat.index()];
            move_markers(&mut player.hourglass, &mut state.supply.hourglass, n)?;
        }
        Edit::SetPotion { seat } => {
            state.players[0].potion = seat == Some(Seat::P0);
            state.players[1].potion = seat == Some(Seat::P1);
            state.supply.potion = seat.is_none();
        }
        Edit::SetBadge { seat } => state.badge = seat,
        Edit::SetHands { hands, discard } => {
            if state.phase != Phase::Plan || state.players.iter().any(|p| p.plan.is_some()) {
                return Err(EditError::WrongPhase);
            }
            let sizes_ok = hands[state.badge.index()].len() == BADGE_HAND_SIZE
                && hands[state.badge.other().index()].len() == OTHER_HAND_SIZE;
            let all: BTreeSet<Character> = hands
                .iter()
                .flatten()
                .copied()
                .chain(std::iter::once(discard))
                .collect();
            if !sizes_ok || all.len() != Character::ALL.len() {
                return Err(EditError::InvalidHands);
            }
            let [mut first, mut second] = hands;
            first.sort();
            second.sort();
            state.players[0].hand = first;
            state.players[1].hand = second;
            state.discard = Some(discard);
        }
    }
    state.tainted = true;
    Ok(())
}
