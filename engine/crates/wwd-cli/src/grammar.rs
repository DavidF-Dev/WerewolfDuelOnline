//! Character names in a grammatical case and with an article, as a locale file gives them.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use fluent_bundle::{FluentArgs, FluentBundle, FluentResource, FluentValue};
use wwd_core::Character;

const CASES: [&str; 4] = ["nom", "acc", "dat", "gen"];
const ARTICLES: [&str; 3] = ["def", "indef", "none"];
/// The message that places the article around a character's name.
const FORM_MESSAGE: &str = "grammar-character-form";

/// The form a character's name takes in a sentence: a case and an article.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Form {
    case: &'static str,
    article: &'static str,
}

impl Form {
    /// The bare name, as a heading or a label shows it.
    pub const BARE: Form = Form {
        case: "nom",
        article: "none",
    };

    /// The form with this case and article, if both are known.
    pub fn new(case: &str, article: &str) -> Option<Form> {
        Some(Form {
            case: CASES.into_iter().find(|known| *known == case)?,
            article: ARTICLES.into_iter().find(|known| *known == article)?,
        })
    }

    pub fn case(self) -> &'static str {
        self.case
    }

    pub fn article(self) -> &'static str {
        self.article
    }
}

/// The ID `CHARACTER` takes for a character, such as `wolf-king`.
pub fn character_id(character: Character) -> &'static str {
    &character.id()["character-".len()..]
}

/// Every character's name in every form, and its gender, as a bundle's messages give them.
pub struct Forms {
    names: BTreeMap<(String, Form), String>,
    genders: BTreeMap<String, String>,
}

impl Forms {
    /// Reads each form from the character messages and `grammar-character-form`, which places the
    /// article; a form it cannot format is left out.
    pub fn read(bundle: &FluentBundle<FluentResource>) -> Self {
        let mut names = BTreeMap::new();
        let mut genders = BTreeMap::new();
        for character in Character::ALL {
            let Some(message) = bundle.get_message(character.id()) else {
                continue;
            };
            let format = |pattern, args: Option<&FluentArgs>| {
                let mut errors = Vec::new();
                let text = bundle.format_pattern(pattern, args, &mut errors);
                errors.is_empty().then(|| text.into_owned())
            };
            let attribute = |name: &str| {
                message
                    .get_attribute(name)
                    .and_then(|attribute| format(attribute.value(), None))
            };
            let Some(name) = message.value().and_then(|value| format(value, None)) else {
                continue;
            };
            let gender = attribute("gender").unwrap_or_else(|| "none".to_string());
            genders.insert(character_id(character).to_string(), gender.clone());
            let with_article = bundle.get_message(FORM_MESSAGE).and_then(|m| m.value());
            for case in CASES {
                let noun = attribute(case).unwrap_or_else(|| name.clone());
                for article in ARTICLES {
                    let form = Form { case, article };
                    let text = match with_article {
                        None => Some(noun.clone()),
                        Some(pattern) => {
                            let mut args = FluentArgs::new();
                            args.set("name", noun.clone());
                            args.set("case", case);
                            args.set("article", article);
                            args.set("gender", gender.clone());
                            format(pattern, Some(&args))
                        }
                    };
                    if let Some(text) = text {
                        names.insert((character_id(character).to_string(), form), text);
                    }
                }
            }
        }
        Self { names, genders }
    }

    /// Character `id`'s name in `form`; `id` may spell its words apart with `_` or `-`.
    pub fn get(&self, id: &str, form: Form) -> Option<&str> {
        self.names
            .get(&(id.replace('_', "-"), form))
            .map(String::as_str)
    }

    /// Character `id`'s gender, which is `none` when its message gives none.
    pub fn gender(&self, id: &str) -> Option<&str> {
        self.genders.get(&id.replace('_', "-")).map(String::as_str)
    }
}

/// `text` as a grammar function's result; without it, an error that adds one to `failures`.
fn answer<'a>(text: Option<&str>, failures: &AtomicUsize) -> FluentValue<'a> {
    match text {
        Some(text) => FluentValue::String(text.to_string().into()),
        None => {
            failures.fetch_add(1, Ordering::Relaxed);
            FluentValue::Error
        }
    }
}

/// The Fluent function `CHARACTER(id, case: …, article: …)`, which names a character in a form.
/// Each call it cannot answer adds one to `failures`, as Fluent records no error for it.
pub fn character(
    forms: Arc<Forms>,
    failures: Arc<AtomicUsize>,
) -> impl for<'a> Fn(&[FluentValue<'a>], &FluentArgs) -> FluentValue<'a> + Send + Sync + 'static {
    move |positional, named| {
        let text = |value: Option<&FluentValue>, default: &'static str| match value {
            None => Some(default.to_string()),
            Some(FluentValue::String(text)) => Some(text.to_string()),
            Some(_) => None,
        };
        let name = match positional {
            [FluentValue::String(id)] => text(named.get("case"), Form::BARE.case)
                .zip(text(named.get("article"), Form::BARE.article))
                .and_then(|(case, article)| Form::new(&case, &article))
                .and_then(|form| forms.get(id, form)),
            _ => None,
        };
        answer(name, &failures)
    }
}

/// The Fluent function `GENDER(id)`, which gives a character's gender for a message to select on.
/// Each call it cannot answer adds one to `failures`.
pub fn gender(
    forms: Arc<Forms>,
    failures: Arc<AtomicUsize>,
) -> impl for<'a> Fn(&[FluentValue<'a>], &FluentArgs) -> FluentValue<'a> + Send + Sync + 'static {
    move |positional, named| {
        let gender = match positional {
            [FluentValue::String(id)] if named.iter().next().is_none() => forms.gender(id),
            _ => None,
        };
        answer(gender, &failures)
    }
}
