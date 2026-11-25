use std::fmt;

use serde::{Deserialize, Serialize};

use crate::ENGINE_VERSION;
use crate::apply::apply;
use crate::command::Command;
use crate::edit::{Edit, EditError};
use crate::event::{Event, EventKind, Visibility};
use crate::game::new_game;
use crate::hash::seed_commitment;
use crate::rng::RngState;
use crate::state::{
    Phase, PlayerState, START_HEALTH, State, Supply, TOTAL_CROSS, TOTAL_FANG, TOTAL_HOURGLASS,
    WIN_CROSS, WIN_FANG, hash,
};
use crate::types::{RuleError, RulesConfig, Seat};
use crate::view::{View, Viewer, view, visible_to};

/// The replay file layout version this engine reads and writes.
pub const REPLAY_FORMAT_VERSION: u32 = 1;

/// Earlier engine versions whose replays this engine plays the same way. Their logs, and so
/// their checkpoint hashes, differ, so those checkpoints are not compared.
const COMPATIBLE_ENGINE_VERSIONS: [&str; 1] = ["0.1.0"];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum ReplayEntry {
    Command {
        seat: Seat,
        cmd: Command,
    },
    /// Replaying an edit needs the `unsafe-edit` feature.
    Edit(Edit),
}

/// The state hash taken after the entry at `index` within its segment.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Checkpoint {
    pub index: u32,
    #[serde(with = "crate::hex")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub hash: [u8; 32],
}

/// A player's public markers at a round boundary.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct BoundaryPlayer {
    pub health: u8,
    pub cross: u8,
    pub fang: u8,
    pub hourglass: u8,
    pub potion: bool,
}

/// The public state at round over, before either seat has asked for the next round.
/// `round` is the round that just ended, and `badge` already holds the next round's Badge.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct RoundBoundary {
    pub round: u32,
    pub badge: Seat,
    pub players: [BoundaryPlayer; 2],
    pub supply: Supply,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum SegmentStart {
    Setup,
    RoundBoundary(RoundBoundary),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Segment {
    pub start: SegmentStart,
    #[serde(with = "crate::hex")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub seed: [u8; 32],
    #[serde(with = "crate::hex")]
    #[cfg_attr(feature = "ts", ts(type = "string"))]
    pub seed_commitment: [u8; 32],
    pub entries: Vec<ReplayEntry>,
    pub checkpoints: Vec<Checkpoint>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct Replay {
    pub format_version: u32,
    pub engine_version: String,
    pub config: RulesConfig,
    pub tainted: bool,
    pub segments: Vec<Segment>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
#[serde(rename_all = "snake_case")]
pub enum ReplayError {
    FormatVersion(u32),
    EngineVersion(String),
    NoSegments,
    Rule { index: u32, err: RuleError },
    Edit { index: u32, err: EditError },
    CheckpointMismatch { segment: usize, index: u32 },
    CommitmentMismatch(usize),
    EditsUnsupported,
    InvalidBoundary,
    SegmentDiscontinuity(usize),
    TaintMismatch,
}

impl ReplayError {
    /// The localisation message ID for this error.
    pub fn id(&self) -> &'static str {
        match self {
            ReplayError::FormatVersion(_) => "error-replay-format-version",
            ReplayError::EngineVersion(_) => "error-replay-engine-version",
            ReplayError::NoSegments => "error-replay-no-segments",
            ReplayError::Rule { .. } => "error-replay-rule",
            ReplayError::Edit { .. } => "error-replay-edit",
            ReplayError::CheckpointMismatch { .. } => "error-replay-checkpoint-mismatch",
            ReplayError::CommitmentMismatch(_) => "error-replay-commitment-mismatch",
            ReplayError::EditsUnsupported => "error-replay-edits-unsupported",
            ReplayError::InvalidBoundary => "error-replay-invalid-boundary",
            ReplayError::SegmentDiscontinuity(_) => "error-replay-segment-discontinuity",
            ReplayError::TaintMismatch => "error-replay-taint-mismatch",
        }
    }
}

impl fmt::Display for ReplayError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.id())
    }
}

impl std::error::Error for ReplayError {}

/// One step of a replay as one viewer may see it: the start of a segment, or one entry.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts", derive(ts_rs::TS), ts(export))]
pub struct TimelineStep {
    pub index: u32,
    /// The seat that sent this step's command; `None` at a segment start or an edit.
    pub seat: Option<Seat>,
    /// `None` at a segment start or an edit, and for another seat's command unless the
    /// viewer is omniscient.
    pub command: Option<Command>,
    /// The events this step logged that the viewer may see.
    pub events: Vec<Event>,
    pub view: View,
}

/// Records the commands applied to a game so it can be replayed and verified.
///
/// It serialises as its [`Replay`] alone, and deserialising rebuilds the state through
/// [`Recorder::from_replay`], so a stored recorder is verified when it is loaded.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(try_from = "Replay", into = "Replay")]
pub struct Recorder {
    state: State,
    replay: Replay,
}

impl Recorder {
    pub fn new(seed: [u8; 32], config: RulesConfig) -> Self {
        Self {
            state: new_game(seed, config),
            replay: Replay {
                format_version: REPLAY_FORMAT_VERSION,
                engine_version: ENGINE_VERSION.to_string(),
                config,
                tainted: false,
                segments: vec![Segment {
                    start: SegmentStart::Setup,
                    seed,
                    seed_commitment: seed_commitment(&seed),
                    entries: Vec::new(),
                    checkpoints: Vec::new(),
                }],
            },
        }
    }

    /// Rebuilds a recorder from a saved replay, verifying its seed commitments and
    /// checkpoints first. A replay from an earlier compatible engine is upgraded to this one.
    pub fn from_replay(replay: Replay) -> Result<Self, ReplayError> {
        let (state, replay) = upgraded(replay)?;
        Ok(Self { state, replay })
    }

    pub fn state(&self) -> &State {
        &self.state
    }

    pub fn replay(&self) -> &Replay {
        &self.replay
    }

    /// Applies and records a command, taking a checkpoint when it ends a round or the
    /// game. A rejected command is not recorded.
    pub fn apply(&mut self, seat: Seat, cmd: Command) -> Result<Vec<Event>, RuleError> {
        let events = apply(&mut self.state, seat, cmd.clone())?;
        let ends_round = events.iter().any(|e| {
            matches!(
                e.kind,
                EventKind::RoundEnded { .. } | EventKind::GameOver { .. }
            )
        });
        let checkpoint_hash = ends_round.then(|| hash(&self.state));
        let segment = self.current_segment();
        segment.entries.push(ReplayEntry::Command { seat, cmd });
        if let Some(hash) = checkpoint_hash {
            let index =
                u32::try_from(segment.entries.len() - 1).expect("segment entry count fits in u32");
            segment.checkpoints.push(Checkpoint { index, hash });
        }
        Ok(events)
    }

    /// Applies and records a rules-bypassing edit, tainting the replay.
    #[cfg(feature = "unsafe-edit")]
    pub fn apply_edit(&mut self, edit: Edit) -> Result<(), EditError> {
        crate::edit::apply_edit(&mut self.state, edit.clone())?;
        self.replay.tainted = true;
        self.current_segment().entries.push(ReplayEntry::Edit(edit));
        Ok(())
    }

    /// The round boundary, available only at round over before either seat is ready.
    pub fn round_boundary(&self) -> Option<RoundBoundary> {
        boundary_of(&self.state)
    }

    /// Continues a game from a saved round boundary under a new seed, appending a new
    /// segment to `prior`. `prior` must verify, and the boundary must be valid and match
    /// where `prior` ended.
    pub fn resume(
        boundary: RoundBoundary,
        prior: Replay,
        new_seed: [u8; 32],
    ) -> Result<Self, ReplayError> {
        validate_boundary(&boundary)?;
        let (prior_state, prior) = upgraded(prior)?;
        if boundary_of(&prior_state).as_ref() != Some(&boundary) {
            return Err(ReplayError::SegmentDiscontinuity(prior.segments.len()));
        }
        let state = state_from_boundary(prior.config, &boundary, new_seed, prior_state.tainted);
        let mut replay = prior;
        replay.segments.push(Segment {
            start: SegmentStart::RoundBoundary(boundary),
            seed: new_seed,
            seed_commitment: seed_commitment(&new_seed),
            entries: Vec::new(),
            checkpoints: Vec::new(),
        });
        Ok(Self { state, replay })
    }

    fn current_segment(&mut self) -> &mut Segment {
        self.replay
            .segments
            .last_mut()
            .expect("a recorder always has a segment")
    }
}

impl From<Recorder> for Replay {
    fn from(recorder: Recorder) -> Self {
        recorder.replay
    }
}

impl TryFrom<Replay> for Recorder {
    type Error = ReplayError;

    fn try_from(replay: Replay) -> Result<Self, ReplayError> {
        Self::from_replay(replay)
    }
}

fn boundary_player(player: &PlayerState) -> BoundaryPlayer {
    BoundaryPlayer {
        health: player.health,
        cross: player.cross,
        fang: player.fang,
        hourglass: player.hourglass,
        potion: player.potion,
    }
}

fn player_from_boundary(player: &BoundaryPlayer) -> PlayerState {
    PlayerState {
        health: player.health,
        cross: player.cross,
        fang: player.fang,
        hourglass: player.hourglass,
        placed: 0,
        potion: player.potion,
        hand: Vec::new(),
        plan: None,
    }
}

/// A state at `boundary` in [`Phase::RoundOver`], with nothing dealt, whose next deal
/// draws from `seed`.
fn state_from_boundary(
    config: RulesConfig,
    boundary: &RoundBoundary,
    seed: [u8; 32],
    tainted: bool,
) -> State {
    State {
        engine_version: ENGINE_VERSION.to_string(),
        config,
        rng: RngState::new(seed),
        round: boundary.round,
        badge: boundary.badge,
        players: [
            player_from_boundary(&boundary.players[0]),
            player_from_boundary(&boundary.players[1]),
        ],
        supply: boundary.supply.clone(),
        discard: None,
        potion_target: None,
        showdown: None,
        phase: Phase::RoundOver,
        next_round_ready: [false; 2],
        log: vec![Event {
            visibility: Visibility::Public,
            kind: EventKind::SegmentStarted {
                round: boundary.round + 1,
                seed_commitment: seed_commitment(&seed),
            },
        }],
        tainted,
    }
}

/// The boundary a state is at: round over, before either seat has asked for the next round.
fn boundary_of(state: &State) -> Option<RoundBoundary> {
    if state.phase != Phase::RoundOver || state.next_round_ready.contains(&true) {
        return None;
    }
    Some(RoundBoundary {
        round: state.round,
        badge: state.badge,
        players: [
            boundary_player(&state.players[0]),
            boundary_player(&state.players[1]),
        ],
        supply: state.supply.clone(),
    })
}

/// Rejects boundaries no real game can reach: round zero, unbalanced marker totals, or a
/// game that is already won.
fn validate_boundary(boundary: &RoundBoundary) -> Result<(), ReplayError> {
    let total = |held: fn(&BoundaryPlayer) -> u8, supply: u8| -> u16 {
        boundary
            .players
            .iter()
            .map(|p| u16::from(held(p)))
            .sum::<u16>()
            + u16::from(supply)
    };
    let potions =
        usize::from(boundary.supply.potion) + boundary.players.iter().filter(|p| p.potion).count();
    let balanced = total(|p| p.cross, boundary.supply.cross) == u16::from(TOTAL_CROSS)
        && total(|p| p.fang, boundary.supply.fang) == u16::from(TOTAL_FANG)
        && total(|p| p.hourglass, boundary.supply.hourglass) == u16::from(TOTAL_HOURGLASS)
        && potions == 1;
    let undecided = boundary.players.iter().all(|p| {
        p.health > 0 && p.health <= START_HEALTH && p.cross < WIN_CROSS && p.fang < WIN_FANG
    });
    if boundary.round == 0 || !balanced || !undecided {
        return Err(ReplayError::InvalidBoundary);
    }
    Ok(())
}

/// Re-simulates every segment and returns the final state, without checking checkpoints
/// or seed commitments.
pub fn replay(r: &Replay) -> Result<State, ReplayError> {
    simulate(r, false)
}

/// Re-simulates the replay, checking each seed commitment and every checkpoint hash.
pub fn verify(r: &Replay) -> Result<(), ReplayError> {
    simulate(r, true).map(drop)
}

/// Every step of the replay as `viewer` may see it: the start of each segment, then each of
/// its entries. The replay is checked as [`verify`] checks it.
pub fn replay_timeline(r: &Replay, viewer: Viewer) -> Result<Vec<TimelineStep>, ReplayError> {
    let mut steps = Vec::new();
    simulate_with(r, true, |state, entry, from| {
        let (seat, command) = match entry {
            Some(ReplayEntry::Command { seat, cmd }) => {
                let sees = viewer == Viewer::Omniscient || viewer == Viewer::Seat(*seat);
                (Some(*seat), sees.then(|| cmd.clone()))
            }
            Some(ReplayEntry::Edit(_)) | None => (None, None),
        };
        steps.push(TimelineStep {
            index: u32::try_from(steps.len()).expect("step count fits in u32"),
            seat,
            command,
            events: state.log[from..]
                .iter()
                .filter(|event| visible_to(event, viewer))
                .cloned()
                .collect(),
            view: view(state, viewer),
        });
    })?;
    Ok(steps)
}

fn simulate(r: &Replay, check: bool) -> Result<State, ReplayError> {
    simulate_with(r, check, |_, _, _| {})
}

/// Verifies the replay and returns its final state, with the replay itself moved to this
/// engine version: an earlier compatible version's checkpoints are taken again here.
fn upgraded(mut r: Replay) -> Result<(State, Replay), ReplayError> {
    if r.engine_version == ENGINE_VERSION {
        return simulate(&r, true).map(|state| (state, r));
    }
    let mut rehashed: Vec<Vec<Checkpoint>> = Vec::new();
    let mut index = 0;
    let state = simulate_with(&r, true, |state, entry, _| {
        if entry.is_none() {
            rehashed.push(Vec::new());
            index = 0;
            return;
        }
        let segment = rehashed.len() - 1;
        let taken = r.segments[segment]
            .checkpoints
            .iter()
            .filter(|c| c.index == index)
            .map(|c| Checkpoint {
                index: c.index,
                hash: hash(state),
            });
        rehashed[segment].extend(taken);
        index += 1;
    })?;
    for (segment, checkpoints) in r.segments.iter_mut().zip(rehashed) {
        segment.checkpoints = checkpoints;
    }
    r.engine_version = ENGINE_VERSION.to_string();
    Ok((state, r))
}

/// Re-simulates the replay, calling `observe` with the state at the start of each segment
/// and after each entry, together with that entry and the log index where its events begin.
fn simulate_with(
    r: &Replay,
    check: bool,
    mut observe: impl FnMut(&State, Option<&ReplayEntry>, usize),
) -> Result<State, ReplayError> {
    if r.format_version != REPLAY_FORMAT_VERSION {
        return Err(ReplayError::FormatVersion(r.format_version));
    }
    let current = r.engine_version == ENGINE_VERSION;
    if !current && !COMPATIBLE_ENGINE_VERSIONS.contains(&r.engine_version.as_str()) {
        return Err(ReplayError::EngineVersion(r.engine_version.clone()));
    }
    let has_edit = r
        .segments
        .iter()
        .flat_map(|s| &s.entries)
        .any(|e| matches!(e, ReplayEntry::Edit(_)));
    if check && has_edit && cfg!(not(feature = "unsafe-edit")) {
        return Err(ReplayError::EditsUnsupported);
    }
    if check && has_edit && !r.tainted {
        return Err(ReplayError::TaintMismatch);
    }
    let mut last: Option<State> = None;
    for (segment_index, segment) in r.segments.iter().enumerate() {
        if check && seed_commitment(&segment.seed) != segment.seed_commitment {
            return Err(ReplayError::CommitmentMismatch(segment_index));
        }
        let mut state = match (&segment.start, &last) {
            (SegmentStart::Setup, None) => new_game(segment.seed, r.config),
            (SegmentStart::RoundBoundary(_), None) | (SegmentStart::Setup, Some(_)) => {
                return Err(ReplayError::SegmentDiscontinuity(segment_index));
            }
            (SegmentStart::RoundBoundary(boundary), Some(previous)) => {
                validate_boundary(boundary)?;
                if boundary_of(previous).as_ref() != Some(boundary) {
                    return Err(ReplayError::SegmentDiscontinuity(segment_index));
                }
                state_from_boundary(r.config, boundary, segment.seed, previous.tainted)
            }
        };
        observe(&state, None, 0);
        let mut checkpoints = segment.checkpoints.iter().peekable();
        for (i, entry) in segment.entries.iter().enumerate() {
            let index = u32::try_from(i).expect("segment entry count fits in u32");
            let from = state.log.len();
            replay_entry(&mut state, entry, index)?;
            observe(&state, Some(entry), from);
            while let Some(checkpoint) = checkpoints.next_if(|c| c.index == index) {
                if check && current && checkpoint.hash != hash(&state) {
                    return Err(ReplayError::CheckpointMismatch {
                        segment: segment_index,
                        index,
                    });
                }
            }
        }
        if check && let Some(checkpoint) = checkpoints.next() {
            return Err(ReplayError::CheckpointMismatch {
                segment: segment_index,
                index: checkpoint.index,
            });
        }
        last = Some(state);
    }
    last.ok_or(ReplayError::NoSegments)
}

fn replay_entry(state: &mut State, entry: &ReplayEntry, index: u32) -> Result<(), ReplayError> {
    match entry {
        ReplayEntry::Command { seat, cmd } => apply(state, *seat, cmd.clone())
            .map(drop)
            .map_err(|err| ReplayError::Rule { index, err }),
        #[cfg(feature = "unsafe-edit")]
        ReplayEntry::Edit(edit) => crate::edit::apply_edit(state, edit.clone())
            .map_err(|err| ReplayError::Edit { index, err }),
        #[cfg(not(feature = "unsafe-edit"))]
        ReplayEntry::Edit(_) => Err(ReplayError::EditsUnsupported),
    }
}
