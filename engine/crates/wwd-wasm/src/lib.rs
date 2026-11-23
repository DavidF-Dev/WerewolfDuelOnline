//! WebAssembly bindings for the Werewolf: Duel! engine.
//!
//! Every exported method is a thin wrapper over a plain function in [`api`] that works on
//! serde types, so the behaviour can be tested natively.

use serde::Serialize;
use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;
use wwd_core::{Command, Event, EventKind, Replay, RulesConfig, Seat, Viewer};

#[doc(hidden)]
pub mod api {
    use serde::Serialize;
    use wwd_core::{
        Command, EditError, Event, EventKind, Pending, Recorder, Replay, ReplayError,
        RoundBoundary, RuleError, RulesConfig, Seat, View, Viewer,
    };

    /// An error as it crosses to JavaScript: the engine's localisation message ID.
    #[derive(Clone, Debug, PartialEq, Eq, Serialize)]
    pub struct ApiError {
        pub id: String,
    }

    impl ApiError {
        pub fn new(id: &str) -> Self {
            Self { id: id.to_owned() }
        }

        pub fn invalid_input() -> Self {
            Self::new("error-invalid-input")
        }
    }

    impl From<RuleError> for ApiError {
        fn from(err: RuleError) -> Self {
            Self::new(err.id())
        }
    }

    impl From<ReplayError> for ApiError {
        fn from(err: ReplayError) -> Self {
            Self::new(err.id())
        }
    }

    impl From<EditError> for ApiError {
        fn from(err: EditError) -> Self {
            Self::new(err.id())
        }
    }

    /// Parses exactly 64 hexadecimal characters, in either case.
    pub fn parse_seed(text: &str) -> Result<[u8; 32], ApiError> {
        let digits = text.as_bytes();
        if digits.len() != 64 {
            return Err(ApiError::invalid_input());
        }
        let mut seed = [0u8; 32];
        let (pairs, _) = digits.as_chunks::<2>();
        for (byte, pair) in seed.iter_mut().zip(pairs) {
            let high = char::from(pair[0]).to_digit(16);
            let low = char::from(pair[1]).to_digit(16);
            let (Some(high), Some(low)) = (high, low) else {
                return Err(ApiError::invalid_input());
            };
            *byte = u8::try_from(high << 4 | low).map_err(|_| ApiError::invalid_input())?;
        }
        Ok(seed)
    }

    fn to_hex(bytes: &[u8; 32]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }

    /// A recorded game.
    pub struct Game {
        recorder: Recorder,
    }

    impl Game {
        pub fn create(seed_hex: &str, config: RulesConfig) -> Result<Self, ApiError> {
            let seed = parse_seed(seed_hex)?;
            Ok(Self {
                recorder: Recorder::new(seed, config),
            })
        }

        pub fn from_replay(replay: Replay) -> Result<Self, ApiError> {
            Ok(Self {
                recorder: Recorder::from_replay(replay)?,
            })
        }

        pub fn apply(&mut self, seat: Seat, cmd: Command) -> Result<Vec<Event>, ApiError> {
            Ok(self.recorder.apply(seat, cmd)?)
        }

        pub fn view(&self, viewer: Viewer) -> View {
            wwd_core::view(self.recorder.state(), viewer)
        }

        pub fn events_since(&self, from: u32, viewer: Viewer) -> Vec<(u32, Event)> {
            wwd_core::events_since(self.recorder.state(), from, viewer)
        }

        pub fn legal_actions(&self, seat: Seat) -> Vec<Command> {
            wwd_core::legal_actions(self.recorder.state(), seat)
        }

        pub fn can_resign(&self, seat: Seat) -> bool {
            wwd_core::can_resign(self.recorder.state(), seat)
        }

        pub fn pending(&self) -> Pending {
            wwd_core::pending(self.recorder.state())
        }

        pub fn round_boundary(&self) -> Option<RoundBoundary> {
            self.recorder.round_boundary()
        }

        pub fn replay(&self) -> Replay {
            self.recorder.replay().clone()
        }

        pub fn log_length(&self) -> u32 {
            u32::try_from(self.recorder.state().log.len()).expect("log length fits in u32")
        }
    }

    pub fn verify_replay(replay: &Replay) -> Result<(), ApiError> {
        Ok(wwd_core::verify(replay)?)
    }

    pub fn seed_commitment(seed_hex: &str) -> Result<String, ApiError> {
        let seed = parse_seed(seed_hex)?;
        Ok(to_hex(&wwd_core::seed_commitment(&seed)))
    }

    pub fn event_id(kind: &EventKind) -> &'static str {
        kind.id()
    }

    pub fn visible_to(event: &Event, viewer: Viewer) -> bool {
        wwd_core::visible_to(event, viewer)
    }

    pub fn engine_version() -> &'static str {
        wwd_core::ENGINE_VERSION
    }
}

use api::ApiError;

// Plain objects and numbers rather than `Map` and `BigInt`; the serialiser stays
// human-readable, so hex-marked byte arrays serialise as strings.
fn serialiser() -> serde_wasm_bindgen::Serializer {
    serde_wasm_bindgen::Serializer::json_compatible()
}

fn error_value(err: ApiError) -> JsValue {
    // An `ApiError` is a single string field, so serialising it cannot fail.
    err.serialize(&serialiser()).unwrap_or(JsValue::NULL)
}

fn from_js<T: DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
    serde_wasm_bindgen::from_value(value).map_err(|_| error_value(ApiError::invalid_input()))
}

fn to_js<T: Serialize + ?Sized>(value: &T) -> Result<JsValue, JsValue> {
    value
        .serialize(&serialiser())
        .map_err(|_| error_value(ApiError::invalid_input()))
}

fn to_js_infallible<T: Serialize + ?Sized>(value: &T) -> JsValue {
    value.serialize(&serialiser()).unwrap_or(JsValue::NULL)
}

/// A recorded game, held in WebAssembly memory.
#[wasm_bindgen]
pub struct WasmGame {
    inner: api::Game,
}

#[wasm_bindgen]
impl WasmGame {
    #[wasm_bindgen(js_name = create)]
    pub fn create(seed_hex: &str, config: JsValue) -> Result<WasmGame, JsValue> {
        let config: RulesConfig = from_js(config)?;
        let inner = api::Game::create(seed_hex, config).map_err(error_value)?;
        Ok(WasmGame { inner })
    }

    #[wasm_bindgen(js_name = fromReplay)]
    pub fn from_replay(replay: JsValue) -> Result<WasmGame, JsValue> {
        let replay: Replay = from_js(replay)?;
        let inner = api::Game::from_replay(replay).map_err(error_value)?;
        Ok(WasmGame { inner })
    }

    pub fn apply(&mut self, seat: JsValue, cmd: JsValue) -> Result<JsValue, JsValue> {
        let seat: Seat = from_js(seat)?;
        let cmd: Command = from_js(cmd)?;
        let events = self.inner.apply(seat, cmd).map_err(error_value)?;
        to_js(&events)
    }

    pub fn view(&self, viewer: JsValue) -> Result<JsValue, JsValue> {
        let viewer: Viewer = from_js(viewer)?;
        to_js(&self.inner.view(viewer))
    }

    #[wasm_bindgen(js_name = eventsSince)]
    pub fn events_since(&self, from: u32, viewer: JsValue) -> Result<JsValue, JsValue> {
        let viewer: Viewer = from_js(viewer)?;
        to_js(&self.inner.events_since(from, viewer))
    }

    #[wasm_bindgen(js_name = legalActions)]
    pub fn legal_actions(&self, seat: JsValue) -> Result<JsValue, JsValue> {
        let seat: Seat = from_js(seat)?;
        to_js(&self.inner.legal_actions(seat))
    }

    #[wasm_bindgen(js_name = canResign)]
    pub fn can_resign(&self, seat: JsValue) -> Result<bool, JsValue> {
        let seat: Seat = from_js(seat)?;
        Ok(self.inner.can_resign(seat))
    }

    pub fn pending(&self) -> JsValue {
        to_js_infallible(&self.inner.pending())
    }

    #[wasm_bindgen(js_name = roundBoundary)]
    pub fn round_boundary(&self) -> JsValue {
        to_js_infallible(&self.inner.round_boundary())
    }

    pub fn replay(&self) -> JsValue {
        to_js_infallible(&self.inner.replay())
    }

    #[wasm_bindgen(js_name = logLength)]
    pub fn log_length(&self) -> u32 {
        self.inner.log_length()
    }
}

#[wasm_bindgen(js_name = verifyReplay)]
pub fn verify_replay(replay: JsValue) -> Result<(), JsValue> {
    let replay: Replay = from_js(replay)?;
    api::verify_replay(&replay).map_err(error_value)
}

#[wasm_bindgen(js_name = seedCommitment)]
pub fn seed_commitment_hex(seed_hex: &str) -> Result<String, JsValue> {
    api::seed_commitment(seed_hex).map_err(error_value)
}

#[wasm_bindgen(js_name = eventId)]
pub fn event_id(kind: JsValue) -> Result<String, JsValue> {
    let kind: EventKind = from_js(kind)?;
    Ok(api::event_id(&kind).to_owned())
}

#[wasm_bindgen(js_name = visibleTo)]
pub fn visible_to(event: JsValue, viewer: JsValue) -> Result<bool, JsValue> {
    let event: Event = from_js(event)?;
    let viewer: Viewer = from_js(viewer)?;
    Ok(api::visible_to(&event, viewer))
}

#[wasm_bindgen(js_name = engineVersion)]
pub fn engine_version() -> String {
    api::engine_version().to_owned()
}
