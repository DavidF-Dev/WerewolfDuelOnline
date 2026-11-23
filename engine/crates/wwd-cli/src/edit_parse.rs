//! Parses `set ...` edit expressions into engine edits.

use wwd_core::{Character, Edit, Seat};

/// What is wrong with an edit expression.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParseErrorKind {
    ExpectedSet,
    UnknownField,
    MissingValue,
    BadValue,
    BadHands,
}

impl ParseErrorKind {
    /// The localisation message ID for this error.
    pub fn id(self) -> &'static str {
        match self {
            ParseErrorKind::ExpectedSet => "error-edit-expected-set",
            ParseErrorKind::UnknownField => "error-edit-unknown-field",
            ParseErrorKind::MissingValue => "error-edit-missing-value",
            ParseErrorKind::BadValue => "error-edit-bad-value",
            ParseErrorKind::BadHands => "error-edit-bad-hands",
        }
    }
}

/// A malformed edit expression.
#[derive(Debug, PartialEq, Eq)]
pub struct ParseError {
    pub kind: ParseErrorKind,
    pub detail: String,
}

fn fail<T>(kind: ParseErrorKind, detail: &str) -> Result<T, ParseError> {
    Err(ParseError {
        kind,
        detail: detail.to_string(),
    })
}

/// Parses expressions given as separate words, whole quoted expressions, or a mix.
pub fn parse_edits(args: &[String]) -> Result<Vec<Edit>, ParseError> {
    let mut tokens = args
        .iter()
        .flat_map(|arg| arg.split_whitespace())
        .peekable();
    let mut edits = Vec::new();
    while let Some(word) = tokens.next() {
        if !word.eq_ignore_ascii_case("set") {
            return fail(ParseErrorKind::ExpectedSet, word);
        }
        let Some(field) = tokens.next() else {
            return fail(ParseErrorKind::MissingValue, "set");
        };
        let field_lower = field.to_ascii_lowercase();
        let edit = if field_lower == "hands" {
            let mut pairs = Vec::new();
            while let Some(pair) = tokens.next_if(|t| !t.eq_ignore_ascii_case("set")) {
                pairs.push(pair);
            }
            parse_hands(&pairs)?
        } else {
            let Some(value) = tokens.next() else {
                return fail(ParseErrorKind::MissingValue, field);
            };
            parse_scalar(&field_lower, value)?
        };
        edits.push(edit);
    }
    Ok(edits)
}

fn parse_scalar(field: &str, value: &str) -> Result<Edit, ParseError> {
    match field {
        "potion" => {
            let seat = if value.eq_ignore_ascii_case("none") {
                None
            } else {
                Some(parse_seat(value)?)
            };
            Ok(Edit::SetPotion { seat })
        }
        "badge" => Ok(Edit::SetBadge {
            seat: parse_seat(value)?,
        }),
        _ => {
            let Some((seat, name)) = field.split_once('.') else {
                return fail(ParseErrorKind::UnknownField, field);
            };
            let seat = parse_seat(seat)?;
            let n = value
                .parse::<u8>()
                .or_else(|_| fail(ParseErrorKind::BadValue, value))?;
            match name {
                "health" => Ok(Edit::SetHealth { seat, n }),
                "cross" => Ok(Edit::SetCross { seat, n }),
                "fang" => Ok(Edit::SetFang { seat, n }),
                "hourglass" => Ok(Edit::SetHourglass { seat, n }),
                _ => fail(ParseErrorKind::UnknownField, field),
            }
        }
    }
}

fn parse_seat(text: &str) -> Result<Seat, ParseError> {
    match text.to_ascii_lowercase().as_str() {
        "p0" => Ok(Seat::P0),
        "p1" => Ok(Seat::P1),
        _ => fail(ParseErrorKind::BadValue, text),
    }
}

fn parse_hands(pairs: &[&str]) -> Result<Edit, ParseError> {
    let (mut p0, mut p1, mut discard) = (None, None, None);
    for pair in pairs {
        let Some((key, value)) = pair.split_once('=') else {
            return fail(ParseErrorKind::BadHands, pair);
        };
        match key.to_ascii_lowercase().as_str() {
            "p0" => p0 = Some(parse_character_list(value)?),
            "p1" => p1 = Some(parse_character_list(value)?),
            "discard" => discard = Some(parse_character(value)?),
            _ => return fail(ParseErrorKind::BadHands, pair),
        }
    }
    match (p0, p1, discard) {
        (Some(p0), Some(p1), Some(discard)) => Ok(Edit::SetHands {
            hands: [p0, p1],
            discard,
        }),
        _ => fail(
            ParseErrorKind::BadHands,
            "p0, p1 and discard are all required",
        ),
    }
}

fn parse_character_list(text: &str) -> Result<Vec<Character>, ParseError> {
    text.split(',').map(parse_character).collect()
}

/// Reads a character by its ID or PascalCase name, ignoring case and separators.
pub fn parse_character(text: &str) -> Result<Character, ParseError> {
    let key: String = text
        .chars()
        .filter(|c| !matches!(c, '_' | '-'))
        .map(|c| c.to_ascii_lowercase())
        .collect();
    Character::ALL
        .into_iter()
        .find(|c| c.id().trim_start_matches("character-").replace('-', "") == key)
        .map_or_else(|| fail(ParseErrorKind::BadValue, text), Ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(text: &[&str]) -> Result<Vec<Edit>, ParseError> {
        parse_edits(&text.iter().map(|s| s.to_string()).collect::<Vec<_>>())
    }

    #[test]
    fn scalar_edits() {
        let edits = parse(&[
            "set p0.health 1",
            "set p1.cross 3",
            "set p0.fang 2",
            "set p1.hourglass 4",
            "set potion none",
            "set potion p1",
            "set badge p0",
        ])
        .unwrap();
        assert_eq!(
            edits,
            vec![
                Edit::SetHealth {
                    seat: Seat::P0,
                    n: 1
                },
                Edit::SetCross {
                    seat: Seat::P1,
                    n: 3
                },
                Edit::SetFang {
                    seat: Seat::P0,
                    n: 2
                },
                Edit::SetHourglass {
                    seat: Seat::P1,
                    n: 4
                },
                Edit::SetPotion { seat: None },
                Edit::SetPotion {
                    seat: Some(Seat::P1)
                },
                Edit::SetBadge { seat: Seat::P0 },
            ]
        );
    }

    #[test]
    fn words_and_quoted_expressions_mix() {
        let edits = parse(&["set", "p1.health", "1", "set badge p1"]).unwrap();
        assert_eq!(edits.len(), 2);
    }

    #[test]
    fn hands_accept_ids_and_pascal_case() {
        let edits = parse(&[
            "set hands p0=Knight,seer,Villager,WolfKing p1=wolfen,Witch,hunter discard=wolf_beauty",
        ])
        .unwrap();
        assert_eq!(
            edits,
            vec![Edit::SetHands {
                hands: [
                    vec![
                        Character::Knight,
                        Character::Seer,
                        Character::Villager,
                        Character::WolfKing
                    ],
                    vec![Character::Wolfen, Character::Witch, Character::Hunter],
                ],
                discard: Character::WolfBeauty,
            }]
        );
    }

    #[test]
    fn errors_carry_ids() {
        assert_eq!(
            parse(&["put p0.health 1"]).unwrap_err().kind,
            ParseErrorKind::ExpectedSet
        );
        assert_eq!(
            parse(&["set p0.mana 1"]).unwrap_err().kind,
            ParseErrorKind::UnknownField
        );
        assert_eq!(
            parse(&["set p0.health"]).unwrap_err().kind,
            ParseErrorKind::MissingValue
        );
        assert_eq!(
            parse(&["set p0.health lots"]).unwrap_err().kind,
            ParseErrorKind::BadValue
        );
        assert_eq!(
            parse(&["set hands p0=Knight"]).unwrap_err().kind,
            ParseErrorKind::BadHands
        );
        assert_eq!(
            parse(&["set hands p0=Dragon p1=Seer discard=Witch"])
                .unwrap_err()
                .kind,
            ParseErrorKind::BadValue
        );
    }
}
