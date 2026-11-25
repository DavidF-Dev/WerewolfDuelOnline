//! Turns engine IDs into text using the shared Fluent locale file.

use std::fmt::Write as _;

use fluent_bundle::{FluentArgs, FluentBundle, FluentResource};
use unic_langid::LanguageIdentifier;
use wwd_core::{
    Character, Command, EditError, EventKind, ForfeitReason, Marker, Plan, ReplayError, RuleError,
    Seat, TargetCard, WinReason,
};

const ENGLISH: &str = include_str!("../../../locales/en/engine.ftl");

/// Builds `FluentArgs` from `"name" => value` pairs.
macro_rules! args {
    ($($key:literal => $value:expr),* $(,)?) => {{
        #[allow(unused_mut)]
        let mut args = ::fluent_bundle::FluentArgs::new();
        $( args.set($key, $value); )*
        args
    }};
}
pub(crate) use args;

/// The English message bundle.
pub struct Locale {
    bundle: FluentBundle<FluentResource>,
}

impl Locale {
    pub fn new() -> Self {
        let resource = FluentResource::try_new(ENGLISH.to_string())
            .expect("the bundled locale file is valid Fluent");
        let mut bundle = FluentBundle::new(vec![
            LanguageIdentifier::from_bytes(b"en").expect("en is a valid language tag"),
        ]);
        bundle.set_use_isolating(false);
        bundle
            .add_resource(resource)
            .expect("the bundled locale file has no duplicate messages");
        Self { bundle }
    }

    /// Formats message `id`, or describes why it could not be formatted.
    pub fn format(&self, id: &str, args: &FluentArgs) -> Result<String, String> {
        let message = self
            .bundle
            .get_message(id)
            .ok_or_else(|| format!("missing message {id}"))?;
        let pattern = message
            .value()
            .ok_or_else(|| format!("message {id} has no value"))?;
        let mut errors = Vec::new();
        let text = self.bundle.format_pattern(pattern, Some(args), &mut errors);
        if errors.is_empty() {
            Ok(text.into_owned())
        } else {
            Err(format!("message {id}: {errors:?}"))
        }
    }

    /// Formats message `id`, falling back to the bare ID so output is never lost.
    pub fn text(&self, id: &str, args: &FluentArgs) -> String {
        self.format(id, args).unwrap_or_else(|_| id.to_string())
    }

    pub fn plain(&self, id: &str) -> String {
        self.text(id, &FluentArgs::new())
    }

    pub fn seat(&self, seat: Seat) -> String {
        self.plain(match seat {
            Seat::P0 => "seat-p0",
            Seat::P1 => "seat-p1",
        })
    }

    pub fn character(&self, character: Character) -> String {
        self.plain(character.id())
    }

    /// A target card as a plan names it, with its article.
    pub fn target_card(&self, card: TargetCard) -> String {
        match card {
            TargetCard::Character(character) => self.text(
                "target-character",
                &args!("character" => self.character(character)),
            ),
            TargetCard::Fool => self.plain("target-fool"),
        }
    }

    pub fn marker(&self, marker: Marker) -> String {
        self.plain(match marker {
            Marker::Cross => "marker-cross",
            Marker::Fang => "marker-fang",
            Marker::Hourglass => "marker-hourglass",
            Marker::Potion => "marker-potion",
        })
    }

    /// A marker's name after a count of `n` of them.
    fn marker_count(&self, marker: Marker, n: u8) -> String {
        let id = match marker {
            Marker::Cross => "marker-cross-count",
            Marker::Fang => "marker-fang-count",
            Marker::Hourglass => "marker-hourglass-count",
            Marker::Potion => return self.marker(marker),
        };
        self.text(id, &args!("n" => u32::from(n)))
    }

    pub fn win_reason(&self, reason: WinReason) -> String {
        self.plain(match reason {
            WinReason::Health => "win-reason-health",
            WinReason::Fangs => "win-reason-fangs",
            WinReason::Crosses => "win-reason-crosses",
            WinReason::Resignation => "win-reason-resignation",
        })
    }

    fn forfeit(&self, reason: ForfeitReason) -> String {
        let id = match reason {
            ForfeitReason::NoCross => "forfeit-no-cross",
            ForfeitReason::Declined => "forfeit-declined",
            ForfeitReason::CannotPayFangs => "forfeit-cannot-pay-fangs",
            ForfeitReason::NoTargets => "forfeit-no-targets",
        };
        self.text(
            id,
            &args!(
                "cross" => self.marker(Marker::Cross),
                "fangs" => self.plain("marker-fangs"),
            ),
        )
    }

    pub fn character_list(&self, cards: &[Character]) -> String {
        join(cards.iter().map(|&c| self.character(c)))
    }

    pub fn plan(&self, plan: &Plan) -> String {
        let character = self.character(plan.character);
        if plan.targets.is_empty() {
            return self.text("plan-no-targets", &args!("character" => character));
        }
        let targets = join(plan.targets.iter().map(|&t| self.target_card(t)));
        self.text(
            "plan-targeting",
            &args!("character" => character, "targets" => targets),
        )
    }

    /// Describes a command as a choice offered to a player.
    pub fn command(&self, cmd: &Command) -> String {
        match cmd {
            Command::SubmitPlan { character, targets } => {
                let plan = Plan {
                    character: *character,
                    targets: targets.iter().copied().collect(),
                };
                self.text("command-submit-plan", &args!("plan" => self.plan(&plan)))
            }
            Command::PlaceHourglasses { n } => {
                self.text("command-place-hourglasses", &args!("n" => u32::from(*n)))
            }
            Command::ChoosePotionTarget { card } => self.text(
                "command-choose-potion-target",
                &args!("card" => self.character(*card)),
            ),
            Command::HunterSpendCross { spend: true } => {
                self.plain("command-hunter-spend-cross-yes")
            }
            Command::HunterSpendCross { spend: false } => {
                self.plain("command-hunter-spend-cross-no")
            }
            Command::NextRound => self.plain("command-next-round"),
            Command::Resign => self.plain("cli-resign"),
        }
    }

    pub fn event(&self, kind: &EventKind) -> String {
        self.try_event(kind)
            .unwrap_or_else(|_| kind.id().to_string())
    }

    /// Adds a seat as a raw selector value (`p0`/`p1`) with its display name.
    fn with_seat<'a>(&self, mut args: FluentArgs<'a>, key: &str, seat: Seat) -> FluentArgs<'a> {
        let id = match seat {
            Seat::P0 => "p0",
            Seat::P1 => "p1",
        };
        args.set(key.to_string(), id);
        args.set(format!("{key}Name"), self.seat(seat));
        args
    }

    fn actor<'a>(&self, seat: Seat) -> FluentArgs<'a> {
        self.with_seat(FluentArgs::new(), "actor", seat)
    }

    pub fn try_event(&self, kind: &EventKind) -> Result<String, String> {
        let id = kind.id();
        match kind {
            EventKind::GameStarted {
                seed_commitment, ..
            } => self.format(id, &args!("commitment" => hex(seed_commitment))),
            EventKind::RoundStarted { round, badge } => {
                let mut args = self.actor(*badge);
                args.set("round", *round);
                args.set("badge", self.plain("marker-badge"));
                self.format(id, &args)
            }
            EventKind::HandDealt { seat, cards } => {
                let mut args = self.actor(*seat);
                args.set("cards", self.character_list(cards));
                self.format(id, &args)
            }
            EventKind::PlanSubmitted { seat, target_count } => {
                let mut args = self.actor(*seat);
                args.set("count", u32::from(*target_count));
                self.format(id, &args)
            }
            EventKind::HourglassesPlaced { seat, n } => {
                let mut args = self.actor(*seat);
                args.set("n", u32::from(*n));
                args.set("hourglasses", self.marker_count(Marker::Hourglass, *n));
                self.format(id, &args)
            }
            EventKind::PotionTargetChosen { seat, card } => {
                let mut args = self.actor(*seat);
                args.set("potion", self.marker(Marker::Potion));
                args.set("card", self.character(*card));
                self.format(id, &args)
            }
            EventKind::PlansRevealed {
                plans,
                effective,
                order,
            } => {
                let mut args = self.with_seat(self.actor(Seat::P0), "other", Seat::P1);
                args = self.with_seat(args, "first", order[0]);
                args.set("actorPlan", self.plan(&plans[0]));
                args.set("actorInitiative", u32::from(effective[0]));
                args.set("otherPlan", self.plan(&plans[1]));
                args.set("otherInitiative", u32::from(effective[1]));
                self.format(id, &args)
            }
            EventKind::PotionResolved {
                target,
                victim,
                hit,
                health_lost,
            } => {
                let mut args = self.with_seat(FluentArgs::new(), "victim", *victim);
                args.set("result", if *hit { "hit" } else { "miss" });
                args.set("potion", self.marker(Marker::Potion));
                args.set("card", self.character(*target));
                args.set("lost", u32::from(*health_lost));
                args.set("health", self.plain("marker-health"));
                self.format(id, &args)
            }
            EventKind::CharacterResolved { seat, character } => {
                let mut args = self.actor(*seat);
                args.set("character", self.character(*character));
                self.format(id, &args)
            }
            EventKind::MarkerGained {
                seat,
                marker,
                from_opponent,
            } => {
                let mut args = self.with_seat(self.actor(*seat), "other", seat.other());
                args.set("marker", self.marker(*marker));
                args.set("markerId", marker_id(*marker));
                args.set("source", if *from_opponent { "opponent" } else { "supply" });
                self.format(id, &args)
            }
            EventKind::MarkerSpent { seat, marker, n } => {
                let mut args = self.actor(*seat);
                args.set("marker", self.marker_count(*marker, *n));
                args.set("n", u32::from(*n));
                self.format(id, &args)
            }
            EventKind::AttackHit {
                seat,
                target_seat,
                attacker,
                character,
                health_lost,
            } => {
                let mut args = self.with_seat(self.actor(*seat), "targetSeat", *target_seat);
                args.set("attacker", self.character(*attacker));
                args.set("character", self.character(*character));
                args.set("lost", u32::from(*health_lost));
                args.set("health", self.plain("marker-health"));
                self.format(id, &args)
            }
            EventKind::AttackMissed { seat, attacker } => {
                let mut args = self.actor(*seat);
                args.set("attacker", self.character(*attacker));
                self.format(id, &args)
            }
            EventKind::AttackForfeited { seat, reason } => {
                let mut args = self.actor(*seat);
                args.set("reason", self.forfeit(*reason));
                self.format(id, &args)
            }
            EventKind::RoundEnded { round, next_badge } => {
                let mut args = self.actor(*next_badge);
                args.set("round", *round);
                args.set("badge", self.plain("marker-badge"));
                self.format(id, &args)
            }
            EventKind::DiscardRevealed { round, character } => self.format(
                id,
                &args!("round" => *round, "character" => self.character(*character)),
            ),
            EventKind::NextRoundRequested { seat } => self.format(id, &self.actor(*seat)),
            EventKind::Resigned { seat } => self.format(id, &self.actor(*seat)),
            EventKind::SegmentStarted { round, .. } => self.format(id, &args!("round" => *round)),
            EventKind::GameOver { winner, reason } => {
                let mut args = self.with_seat(self.actor(*winner), "other", winner.other());
                args.set("health", self.plain("marker-health"));
                args.set("fangs", self.plain("marker-fangs"));
                args.set("crosses", self.plain("marker-crosses"));
                args.set(
                    "reason",
                    match reason {
                        WinReason::Health => "health",
                        WinReason::Fangs => "fangs",
                        WinReason::Crosses => "crosses",
                        WinReason::Resignation => "resignation",
                    },
                );
                self.format(id, &args)
            }
        }
    }

    /// The message for a rule error, prefixed with its ID.
    pub fn rule_error(&self, err: RuleError) -> String {
        with_id(err.id(), &self.plain(err.id()))
    }

    pub fn edit_error(&self, err: EditError) -> String {
        with_id(err.id(), &self.plain(err.id()))
    }

    pub fn replay_error(&self, err: &ReplayError) -> String {
        let text = self
            .try_replay_error(err)
            .unwrap_or_else(|_| err.id().to_string());
        with_id(err.id(), &text)
    }

    fn try_replay_error(&self, err: &ReplayError) -> Result<String, String> {
        let args = match err {
            ReplayError::FormatVersion(version) => args!("version" => version.to_string()),
            ReplayError::EngineVersion(version) => args!("version" => version.clone()),
            ReplayError::Rule { index, err } => {
                args!("index" => *index, "detail" => self.plain(err.id()))
            }
            ReplayError::Edit { index, err } => {
                args!("index" => *index, "detail" => self.plain(err.id()))
            }
            ReplayError::CheckpointMismatch { segment, index } => {
                args!("segment" => *segment as u64, "index" => *index)
            }
            ReplayError::CommitmentMismatch(segment)
            | ReplayError::SegmentDiscontinuity(segment) => args!("segment" => *segment as u64),
            ReplayError::NoSegments
            | ReplayError::EditsUnsupported
            | ReplayError::InvalidBoundary
            | ReplayError::TaintMismatch => args!(),
        };
        self.format(err.id(), &args)
    }

    /// A CLI message with its ID prefix, for error output.
    pub fn error(&self, id: &str, args: &FluentArgs) -> String {
        with_id(id, &self.text(id, args))
    }
}

/// A marker's raw selector value, as its wire name.
fn marker_id(marker: Marker) -> &'static str {
    match marker {
        Marker::Cross => "cross",
        Marker::Fang => "fang",
        Marker::Hourglass => "hourglass",
        Marker::Potion => "potion",
    }
}

fn with_id(id: &str, text: &str) -> String {
    format!("{id}: {text}")
}

/// Joins items as English prose: "A", "A and B", "A, B and C".
fn join(items: impl Iterator<Item = String>) -> String {
    let items: Vec<String> = items.collect();
    match items.split_last() {
        None => String::new(),
        Some((last, [])) => last.clone(),
        Some((last, rest)) => format!("{} and {last}", rest.join(", ")),
    }
}

/// Lowercase hexadecimal.
pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut out, byte| {
        let _ = write!(out, "{byte:02x}");
        out
    })
}

#[cfg(test)]
mod tests {
    use wwd_core::RulesConfig;

    use super::*;
    use crate::edit_parse::ParseErrorKind;

    /// Defines a function returning samples for a type. Each arm names a variant pattern and
    /// its samples; the patterns form an exhaustive match, so a new variant fails to compile
    /// until it has an arm here.
    macro_rules! samples {
        ($name:ident -> $ty:ty { $($pat:pat => $sample:expr),+ $(,)? }) => {
            fn $name() -> Vec<$ty> {
                #[allow(dead_code)]
                fn exhaustive(value: &$ty) {
                    match value {
                        $($pat => {}),+
                    }
                }
                let mut all = Vec::new();
                $( all.extend($sample); )+
                all
            }
        };
    }

    fn plan(character: Character, targets: &[TargetCard]) -> Plan {
        Plan {
            character,
            targets: targets.iter().copied().collect(),
        }
    }

    samples!(event_samples -> EventKind {
        EventKind::GameStarted { .. } => [EventKind::GameStarted {
            config: RulesConfig::default(),
            seed_commitment: [7; 32],
        }],
        EventKind::RoundStarted { .. } => [EventKind::RoundStarted { round: 1, badge: Seat::P0 }],
        EventKind::HandDealt { .. } => [EventKind::HandDealt {
            seat: Seat::P1,
            cards: vec![Character::Hunter, Character::Seer],
        }],
        EventKind::PlanSubmitted { .. } => [
            EventKind::PlanSubmitted { seat: Seat::P0, target_count: 1 },
            EventKind::PlanSubmitted { seat: Seat::P0, target_count: 3 },
        ],
        EventKind::HourglassesPlaced { .. } => [
            EventKind::HourglassesPlaced { seat: Seat::P1, n: 1 },
            EventKind::HourglassesPlaced { seat: Seat::P1, n: 2 },
        ],
        EventKind::PotionTargetChosen { .. } => [EventKind::PotionTargetChosen {
            seat: Seat::P0,
            card: Character::Witch,
        }],
        EventKind::PlansRevealed { .. } => [EventKind::PlansRevealed {
            plans: [
                plan(
                    Character::Seer,
                    &[TargetCard::Character(Character::Wolfen), TargetCard::Fool],
                ),
                plan(Character::Villager, &[]),
            ],
            effective: [5, 8],
            order: [Seat::P0, Seat::P1],
        }],
        EventKind::PotionResolved { .. } => [
            EventKind::PotionResolved {
                target: Character::Seer,
                victim: Seat::P1,
                hit: true,
                health_lost: 1,
            },
            EventKind::PotionResolved {
                target: Character::Seer,
                victim: Seat::P0,
                hit: false,
                health_lost: 0,
            },
        ],
        EventKind::CharacterResolved { .. } => [EventKind::CharacterResolved {
            seat: Seat::P0,
            character: Character::WolfKing,
        }],
        EventKind::MarkerGained { .. } => [
            EventKind::MarkerGained {
                seat: Seat::P0,
                marker: Marker::Hourglass,
                from_opponent: true,
            },
            EventKind::MarkerGained {
                seat: Seat::P1,
                marker: Marker::Cross,
                from_opponent: false,
            },
        ],
        EventKind::MarkerSpent { .. } => [
            EventKind::MarkerSpent { seat: Seat::P0, marker: Marker::Fang, n: 1 },
            EventKind::MarkerSpent { seat: Seat::P0, marker: Marker::Fang, n: 2 },
        ],
        EventKind::AttackHit { .. } => [EventKind::AttackHit {
            seat: Seat::P0,
            target_seat: Seat::P1,
            attacker: Character::Knight,
            character: Character::Wolfen,
            health_lost: 1,
        }],
        EventKind::AttackMissed { .. } => [EventKind::AttackMissed {
            seat: Seat::P1,
            attacker: Character::Seer,
        }],
        EventKind::AttackForfeited { .. } => [
            ForfeitReason::NoCross,
            ForfeitReason::Declined,
            ForfeitReason::CannotPayFangs,
            ForfeitReason::NoTargets,
        ]
        .map(|reason| EventKind::AttackForfeited { seat: Seat::P0, reason }),
        EventKind::RoundEnded { .. } => [EventKind::RoundEnded { round: 3, next_badge: Seat::P1 }],
        EventKind::NextRoundRequested { .. } => [EventKind::NextRoundRequested { seat: Seat::P0 }],
        EventKind::Resigned { .. } => [EventKind::Resigned { seat: Seat::P0 }],
        EventKind::SegmentStarted { .. } => [EventKind::SegmentStarted {
            round: 3,
            seed_commitment: [7; 32],
        }],
        EventKind::GameOver { .. } => [EventKind::GameOver {
            winner: Seat::P1,
            reason: WinReason::Crosses,
        }],
        EventKind::DiscardRevealed { .. } => [EventKind::DiscardRevealed {
            round: 1,
            character: Character::Villager,
        }],
    });

    samples!(rule_error_samples -> RuleError {
        RuleError::GameOver => [RuleError::GameOver],
        RuleError::NotYourTurn => [RuleError::NotYourTurn],
        RuleError::WrongPhase => [RuleError::WrongPhase],
        RuleError::CharacterNotInHand => [RuleError::CharacterNotInHand],
        RuleError::TargetNotAllowed => [RuleError::TargetNotAllowed],
        RuleError::TooManyTargets => [RuleError::TooManyTargets],
        RuleError::TooFewTargets => [RuleError::TooFewTargets],
        RuleError::NotEnoughHourglasses => [RuleError::NotEnoughHourglasses],
        RuleError::InvalidPotionTarget => [RuleError::InvalidPotionTarget],
    });

    samples!(edit_error_samples -> EditError {
        EditError::WrongPhase => [EditError::WrongPhase],
        EditError::SupplyExceeded => [EditError::SupplyExceeded],
        EditError::InvalidHands => [EditError::InvalidHands],
        EditError::WouldEndGame => [EditError::WouldEndGame],
    });

    samples!(parse_error_samples -> ParseErrorKind {
        ParseErrorKind::ExpectedSet => [ParseErrorKind::ExpectedSet],
        ParseErrorKind::UnknownField => [ParseErrorKind::UnknownField],
        ParseErrorKind::MissingValue => [ParseErrorKind::MissingValue],
        ParseErrorKind::BadValue => [ParseErrorKind::BadValue],
        ParseErrorKind::BadHands => [ParseErrorKind::BadHands],
    });

    samples!(replay_error_samples -> ReplayError {
        ReplayError::FormatVersion(_) => [ReplayError::FormatVersion(9)],
        ReplayError::EngineVersion(_) => [ReplayError::EngineVersion("0.0.0".into())],
        ReplayError::NoSegments => [ReplayError::NoSegments],
        ReplayError::Rule { .. } => [ReplayError::Rule { index: 4, err: RuleError::WrongPhase }],
        ReplayError::Edit { .. } => [ReplayError::Edit { index: 4, err: EditError::InvalidHands }],
        ReplayError::CheckpointMismatch { .. } => [ReplayError::CheckpointMismatch {
            segment: 1,
            index: 2,
        }],
        ReplayError::CommitmentMismatch(_) => [ReplayError::CommitmentMismatch(1)],
        ReplayError::EditsUnsupported => [ReplayError::EditsUnsupported],
        ReplayError::InvalidBoundary => [ReplayError::InvalidBoundary],
        ReplayError::SegmentDiscontinuity(_) => [ReplayError::SegmentDiscontinuity(1)],
        ReplayError::TaintMismatch => [ReplayError::TaintMismatch],
    });

    #[test]
    fn every_event_and_error_has_ftl_message() {
        let loc = Locale::new();
        let none = FluentArgs::new();

        for kind in event_samples() {
            let text = loc
                .try_event(&kind)
                .unwrap_or_else(|err| panic!("{kind:?}: {err}"));
            assert!(!text.is_empty());
        }

        for character in Character::ALL {
            loc.format(character.id(), &none).unwrap();
            loc.format(character.faction().id(), &none).unwrap();
        }
        for id in [
            "target-fool",
            "seat-p0",
            "seat-p1",
            "marker-cross",
            "marker-fang",
            "marker-hourglass",
            "marker-potion",
            "marker-health",
            "marker-badge",
            "forfeit-no-targets",
            "marker-crosses",
            "marker-fangs",
            "win-reason-health",
            "win-reason-fangs",
            "win-reason-crosses",
            "win-reason-resignation",
        ] {
            loc.format(id, &none).unwrap();
        }

        for err in rule_error_samples() {
            loc.format(err.id(), &none)
                .unwrap_or_else(|why| panic!("{err:?}: {why}"));
        }
        for err in edit_error_samples() {
            loc.format(err.id(), &none)
                .unwrap_or_else(|why| panic!("{err:?}: {why}"));
        }
        for err in replay_error_samples() {
            loc.try_replay_error(&err)
                .unwrap_or_else(|why| panic!("{err:?}: {why}"));
        }
    }

    #[test]
    fn every_cli_message_formats() {
        let loc = Locale::new();
        for kind in parse_error_samples() {
            loc.format(kind.id(), &args!("detail" => "x"))
                .unwrap_or_else(|why| panic!("{why}"));
        }
        let some = args!("detail" => "x", "line" => 1u32, "path" => "p", "n" => 1u32);
        for id in [
            "error-unsafe-required",
            "error-read-failed",
            "error-write-failed",
            "error-parse-failed",
            "error-script-line",
            "error-fuzz-failed",
            "cli-saved",
            "cli-state-written",
            "cli-verify-tainted",
        ] {
            loc.format(id, &some).unwrap_or_else(|why| panic!("{why}"));
        }
        for cmd in [
            Command::PlaceHourglasses { n: 1 },
            Command::ChoosePotionTarget {
                card: Character::Witch,
            },
            Command::HunterSpendCross { spend: true },
            Command::HunterSpendCross { spend: false },
            Command::NextRound,
            Command::Resign,
            Command::SubmitPlan {
                character: Character::Seer,
                targets: vec![TargetCard::Fool],
            },
        ] {
            let text = loc.command(&cmd);
            assert!(!text.starts_with("command-"), "{cmd:?}");
        }
    }

    #[test]
    fn attack_hit_names_the_attacker_and_the_victim() {
        let loc = Locale::new();
        let text = loc.event(&EventKind::AttackHit {
            seat: Seat::P0,
            target_seat: Seat::P1,
            attacker: Character::Knight,
            character: Character::Wolfen,
            health_lost: 1,
        });
        assert_eq!(
            text,
            "Player 1's Knight hits Player 2's Wolfen! Player 2 loses 1 Health."
        );
    }

    #[test]
    fn changed_event_text_reads_as_prose() {
        let loc = Locale::new();
        let cases = [
            (
                EventKind::DiscardRevealed {
                    round: 3,
                    character: Character::Seer,
                },
                "The card set aside in round 3 was the Seer.",
            ),
            (
                EventKind::RoundStarted {
                    round: 2,
                    badge: Seat::P1,
                },
                "Round 2 begins. Player 2 holds the Badge.",
            ),
            (
                EventKind::HourglassesPlaced {
                    seat: Seat::P1,
                    n: 2,
                },
                "Player 2 places 2 Hourglasses.",
            ),
            (
                EventKind::HourglassesPlaced {
                    seat: Seat::P1,
                    n: 1,
                },
                "Player 2 places 1 Hourglass.",
            ),
            (
                EventKind::PotionTargetChosen {
                    seat: Seat::P0,
                    card: Character::Witch,
                },
                "Player 1 aims the Potion at the Witch.",
            ),
            (
                EventKind::PotionResolved {
                    target: Character::Seer,
                    victim: Seat::P1,
                    hit: true,
                    health_lost: 1,
                },
                "The Potion hits Player 2's Seer! Player 2 loses 1 Health.",
            ),
            (
                EventKind::PotionResolved {
                    target: Character::Seer,
                    victim: Seat::P0,
                    hit: false,
                    health_lost: 0,
                },
                "The Potion misses: Player 1 did not play the Seer.",
            ),
            (
                EventKind::MarkerGained {
                    seat: Seat::P0,
                    marker: Marker::Hourglass,
                    from_opponent: true,
                },
                "Player 1 takes 1 Hourglass from Player 2.",
            ),
            (
                EventKind::MarkerGained {
                    seat: Seat::P1,
                    marker: Marker::Cross,
                    from_opponent: false,
                },
                "Player 2 gains 1 Cross.",
            ),
            (
                EventKind::MarkerGained {
                    seat: Seat::P1,
                    marker: Marker::Potion,
                    from_opponent: false,
                },
                "Player 2 gains the Potion.",
            ),
            (
                EventKind::MarkerSpent {
                    seat: Seat::P0,
                    marker: Marker::Fang,
                    n: 2,
                },
                "Player 1 spends 2 Fangs.",
            ),
            (
                EventKind::MarkerSpent {
                    seat: Seat::P0,
                    marker: Marker::Cross,
                    n: 1,
                },
                "Player 1 spends 1 Cross.",
            ),
            (
                EventKind::RoundEnded {
                    round: 3,
                    next_badge: Seat::P1,
                },
                "Round 3 ends. Player 2 takes the Badge.",
            ),
            (
                EventKind::AttackMissed {
                    seat: Seat::P1,
                    attacker: Character::Knight,
                },
                "Player 2's Knight misses.",
            ),
            (
                EventKind::AttackForfeited {
                    seat: Seat::P0,
                    reason: ForfeitReason::CannotPayFangs,
                },
                "Player 1 makes no attack: there are not enough Fangs for the extra targets.",
            ),
            (
                EventKind::GameOver {
                    winner: Seat::P1,
                    reason: WinReason::Fangs,
                },
                "Player 2 wins by collecting enough Fangs.",
            ),
            (
                EventKind::HourglassesPlaced {
                    seat: Seat::P0,
                    n: 0,
                },
                "Player 1 places no Hourglasses.",
            ),
            (
                EventKind::PlansRevealed {
                    plans: [
                        Plan {
                            character: Character::Seer,
                            targets: [
                                TargetCard::Character(Character::Wolfen),
                                TargetCard::Character(Character::WolfKing),
                                TargetCard::Fool,
                            ]
                            .into(),
                        },
                        Plan {
                            character: Character::Villager,
                            targets: [TargetCard::Fool].into(),
                        },
                    ],
                    effective: [5, 8],
                    order: [Seat::P0, Seat::P1],
                },
                "Plans revealed. Player 1 plays Seer targeting the Wolf King, the Wolfen and the Fool at initiative 5. Player 2 plays Villager targeting the Fool at initiative 8. Player 1 resolves first.",
            ),
        ];
        for (kind, text) in cases {
            assert_eq!(loc.event(&kind), text, "{kind:?}");
        }
    }

    #[test]
    fn lists_read_as_prose() {
        let loc = Locale::new();
        let text = loc.event(&EventKind::HandDealt {
            seat: Seat::P1,
            cards: vec![Character::Hunter, Character::Knight, Character::Seer],
        });
        assert_eq!(text, "Player 2 is dealt Hunter, Knight and Seer.");
    }

    #[test]
    fn game_over_names_the_loser() {
        let loc = Locale::new();
        let text = loc.event(&EventKind::GameOver {
            winner: Seat::P0,
            reason: WinReason::Health,
        });
        assert_eq!(text, "Player 1 wins by reducing Player 2's Health to zero.");
    }

    #[test]
    fn resignation_text_reads_from_every_perspective() {
        let loc = Locale::new();
        let seat_args = |actor: &str, other: &str| {
            args!(
                "actor" => actor.to_string(),
                "actorName" => "Player 1",
                "other" => other.to_string(),
                "otherName" => "Player 2",
                "reason" => "resignation",
                "youCap" => loc.plain("player-you-cap"),
                "you" => loc.plain("player-you"),
                "yourCap" => loc.plain("player-your-cap"),
                "your" => loc.plain("player-your"),
                "opponentCap" => loc.plain("player-opponent-cap"),
                "opponent" => loc.plain("player-opponent"),
            )
        };
        let resigned = ["you", "opponent", "p0"].map(|actor| {
            loc.format("event-resigned", &seat_args(actor, "p1"))
                .unwrap()
        });
        assert_eq!(
            resigned,
            ["You resign.", "Your opponent resigns.", "Player 1 resigns."]
        );
        let over =
            [("you", "opponent"), ("opponent", "you"), ("p0", "p1")].map(|(actor, other)| {
                loc.format("event-game-over", &seat_args(actor, other))
                    .unwrap()
            });
        assert_eq!(
            over,
            [
                "You win because your opponent resigned.",
                "Your opponent wins because you resigned.",
                "Player 1 wins because Player 2 resigned.",
            ]
        );
        assert_eq!(
            loc.event(&EventKind::Resigned { seat: Seat::P1 }),
            "Player 2 resigns."
        );
        assert_eq!(loc.command(&Command::Resign), "Resign");
    }
}
