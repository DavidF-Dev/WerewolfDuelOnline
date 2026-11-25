//! Deterministic rules engine for Werewolf: Duel!

/// The engine crate version, recorded in every serialised state.
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");

mod apply;
mod command;
mod edit;
mod end;
mod event;
#[cfg(feature = "fuzz")]
pub mod fuzz;
mod game;
mod hash;
mod hex;
mod legal;
mod replay;
mod rng;
mod showdown;
mod state;
mod targeting;
mod types;
mod view;

pub use apply::{apply, effective_initiative, resolution_order};
pub use command::Command;
#[cfg(feature = "unsafe-edit")]
pub use edit::apply_edit;
pub use edit::{Edit, EditError};
pub use event::{Event, EventKind, ForfeitReason, Marker, Visibility};
#[cfg(feature = "fuzz")]
pub use fuzz::{FuzzReport, check_invariants, check_timeline_step, fuzz, random_game};
pub use game::new_game;
pub use hash::{content_hash, hash_bytes, seed_commitment};
pub use legal::{can_resign, legal_actions};
pub use replay::{
    BoundaryPlayer, Checkpoint, REPLAY_FORMAT_VERSION, Recorder, Replay, ReplayEntry, ReplayError,
    RoundBoundary, Segment, SegmentStart, TimelineStep, replay, replay_timeline, verify,
};
pub use rng::RngState;
pub use state::*;
pub use targeting::{
    AbilitySummary, AttackRule, AttackShape, Cost, ability_summary, attack_rule, validate_plan,
};
pub use types::*;
pub use view::{
    Pending, PendingKind, PlanView, PlayerView, View, Viewer, events_since, pending,
    showdown_order, view, visible_to,
};
