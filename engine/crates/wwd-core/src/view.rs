use serde::{Deserialize, Serialize};

use crate::event::{Event, Visibility};
use crate::state::{Phase, PlayerState, PotionTarget, State, Supply};
use crate::types::{Character, Plan, Seat};

/// Who a view or event filter is for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum Viewer {
    Seat(Seat),
    Spectator,
    /// Sees everything, including hands and the discard.
    Omniscient,
}

/// A plan as one viewer may see it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum PlanView {
    /// No plan submitted this round.
    None,
    /// Submitted but sealed; only the number of target cards is disclosed.
    Hidden {
        target_count: u8,
    },
    Revealed(Plan),
}

/// A player's state as one viewer may see it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct PlayerView {
    pub health: u8,
    pub cross: u8,
    pub fang: u8,
    pub hourglass: u8,
    pub placed: u8,
    pub potion: bool,
    /// `None` when the viewer may not see this hand.
    pub hand: Option<Vec<Character>>,
    pub hand_size: u8,
    pub plan: PlanView,
}

/// The game as one viewer may see it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct View {
    pub round: u32,
    pub badge: Seat,
    pub viewer: Viewer,
    pub players: [PlayerView; 2],
    pub supply: Supply,
    pub phase: Phase,
    pub potion_target: Option<PotionTarget>,
    /// The seats in the order this round's showdown resolves them, from the reveal until
    /// the next round is dealt.
    pub showdown: Option<[Seat; 2]>,
    /// `Some` only for [`Viewer::Omniscient`].
    pub discard: Option<Character>,
    pub pending: Pending,
}

/// Which seats must act next, and what kind of input they owe.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Pending {
    pub seats: Vec<Seat>,
    pub kind: PendingKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum PendingKind {
    Plan,
    PlaceHourglasses,
    ChoosePotionTarget,
    HunterChoice,
    NextRound,
    /// The game is over.
    None,
}

/// The state redacted for `viewer`: hidden hands, sealed plans and the discard are
/// withheld. The log is not part of the view; see [`events_since`].
pub fn view(state: &State, viewer: Viewer) -> View {
    // The showdown exists from the reveal until the next round is dealt.
    let revealed = state.showdown.is_some();
    let players = [Seat::P0, Seat::P1].map(|seat| {
        let sees_all = match viewer {
            Viewer::Seat(own) => own == seat,
            Viewer::Spectator => false,
            Viewer::Omniscient => true,
        };
        player_view(state.player(seat), sees_all, revealed)
    });
    View {
        round: state.round,
        badge: state.badge,
        viewer,
        players,
        supply: state.supply.clone(),
        phase: state.phase.clone(),
        potion_target: state.potion_target,
        showdown: state.showdown.as_ref().map(|showdown| showdown.order),
        discard: match viewer {
            Viewer::Omniscient => state.discard,
            Viewer::Seat(_) | Viewer::Spectator => None,
        },
        pending: pending(state),
    }
}

/// The seats in showdown order once the plans are revealed, until the next round is dealt.
pub fn showdown_order(view: &View) -> Option<[Seat; 2]> {
    view.showdown
}

fn player_view(player: &PlayerState, sees_all: bool, revealed: bool) -> PlayerView {
    let plan = match &player.plan {
        None => PlanView::None,
        Some(plan) if sees_all || revealed => PlanView::Revealed(plan.clone()),
        Some(plan) => PlanView::Hidden {
            target_count: u8::try_from(plan.targets.len()).expect("at most nine target cards"),
        },
    };
    PlayerView {
        health: player.health,
        cross: player.cross,
        fang: player.fang,
        hourglass: player.hourglass,
        placed: player.placed,
        potion: player.potion,
        hand: sees_all.then(|| player.hand.clone()),
        hand_size: u8::try_from(player.hand.len()).expect("at most four cards in hand"),
        plan,
    }
}

/// Who must act next. In the plan phase, every seat that has not yet submitted; at round
/// over, every seat that has not yet asked for the next round.
pub fn pending(state: &State) -> Pending {
    let (seats, kind) = match state.phase {
        Phase::Plan => (
            [Seat::P0, Seat::P1]
                .into_iter()
                .filter(|&s| state.player(s).plan.is_none())
                .collect(),
            PendingKind::Plan,
        ),
        Phase::RoundOver => (
            [Seat::P0, Seat::P1]
                .into_iter()
                .filter(|&s| !state.next_round_ready[s.index()])
                .collect(),
            PendingKind::NextRound,
        ),
        Phase::RevealHourglass { seat } => (vec![seat], PendingKind::PlaceHourglasses),
        Phase::RevealPotion { seat } => (vec![seat], PendingKind::ChoosePotionTarget),
        Phase::HunterChoice { seat } => (vec![seat], PendingKind::HunterChoice),
        Phase::GameOver { .. } => (Vec::new(), PendingKind::None),
    };
    Pending { seats, kind }
}

/// Whether `viewer` may see `event`. Seat-private events are visible to that seat and
/// to [`Viewer::Omniscient`] only.
pub fn visible_to(event: &Event, viewer: Viewer) -> bool {
    match (event.visibility, viewer) {
        (Visibility::Public, _) | (Visibility::Seat(_), Viewer::Omniscient) => true,
        (Visibility::Seat(seat), Viewer::Seat(own)) => seat == own,
        (Visibility::Seat(_), Viewer::Spectator) => false,
    }
}

/// The log events at index `from` or later that `viewer` may see, each paired with its
/// log index as a sequence number.
pub fn events_since(state: &State, from: u32, viewer: Viewer) -> Vec<(u32, Event)> {
    let start = usize::try_from(from).unwrap_or(usize::MAX);
    state
        .log
        .iter()
        .enumerate()
        .skip(start)
        .filter(|(_, event)| visible_to(event, viewer))
        .map(|(index, event)| {
            let seq = u32::try_from(index).expect("log length fits in u32");
            (seq, event.clone())
        })
        .collect()
}
