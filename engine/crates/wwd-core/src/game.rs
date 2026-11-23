use crate::ENGINE_VERSION;
use crate::event::{Event, EventKind, Visibility};
use crate::hash::seed_commitment;
use crate::rng::RngState;
use crate::state::{
    BADGE_HAND_SIZE, OTHER_HAND_SIZE, Phase, PlayerState, START_HEALTH, State, Supply, TOTAL_CROSS,
    TOTAL_FANG, TOTAL_HOURGLASS,
};
use crate::types::{BadgeStart, Character, RulesConfig, Seat};

fn starting_player() -> PlayerState {
    PlayerState {
        health: START_HEALTH,
        cross: 1,
        fang: 0,
        hourglass: 0,
        placed: 0,
        potion: false,
        hand: Vec::new(),
        plan: None,
    }
}

/// Sets up a game from `seed` and deals round 1, ready for plans.
pub fn new_game(seed: [u8; 32], config: RulesConfig) -> State {
    let mut rng = RngState::new(seed);
    let badge = match config.badge_start {
        BadgeStart::Random => {
            if rng.below(2) == 0 {
                Seat::P0
            } else {
                Seat::P1
            }
        }
        BadgeStart::Seat(seat) => seat,
    };

    let mut players = [starting_player(), starting_player()];
    players[badge.other().index()].hourglass = 1;

    let mut state = State {
        engine_version: ENGINE_VERSION.to_string(),
        config,
        rng,
        round: 0,
        badge,
        players,
        supply: Supply {
            cross: TOTAL_CROSS - 2,
            fang: TOTAL_FANG,
            hourglass: TOTAL_HOURGLASS - 1,
            potion: true,
        },
        discard: None,
        potion_target: None,
        showdown: None,
        phase: Phase::Plan,
        next_round_ready: [false; 2],
        log: Vec::new(),
        tainted: false,
    };
    begin_game(&mut state, &seed);
    state
}

/// Advances to the next round: shuffles, deals and opens the plan phase, appending the
/// round's events to `events`.
pub(crate) fn start_round(state: &mut State, events: &mut Vec<Event>) {
    debug_assert!(
        state.players.iter().all(|p| p.placed == 0),
        "placed hourglasses must be returned before a round starts"
    );
    state.round += 1;
    let mut deck = Character::ALL;
    state.rng.shuffle(&mut deck);

    state.discard = Some(deck[0]);
    let badge_end = 1 + BADGE_HAND_SIZE;
    let hands = [
        (state.badge, &deck[1..badge_end]),
        (
            state.badge.other(),
            &deck[badge_end..badge_end + OTHER_HAND_SIZE],
        ),
    ];

    events.push(Event {
        visibility: Visibility::Public,
        kind: EventKind::RoundStarted {
            round: state.round,
            badge: state.badge,
        },
    });
    for (seat, cards) in hands {
        let mut hand = cards.to_vec();
        hand.sort();
        events.push(Event {
            visibility: Visibility::Seat(seat),
            kind: EventKind::HandDealt {
                seat,
                cards: hand.clone(),
            },
        });
        let player = state.player_mut(seat);
        player.hand = hand;
        player.plan = None;
    }
    state.potion_target = None;
    state.showdown = None;
    state.next_round_ready = [false; 2];
    state.phase = Phase::Plan;
}

/// The public event that opens a game played under `seed`.
fn game_started(config: RulesConfig, seed: &[u8; 32]) -> Event {
    Event {
        visibility: Visibility::Public,
        kind: EventKind::GameStarted {
            config,
            seed_commitment: seed_commitment(seed),
        },
    }
}

/// Logs the game start under `seed` and deals the first round of a freshly built state.
fn begin_game(state: &mut State, seed: &[u8; 32]) {
    let mut events = vec![game_started(state.config, seed)];
    start_round(state, &mut events);
    state.log = events;
}
