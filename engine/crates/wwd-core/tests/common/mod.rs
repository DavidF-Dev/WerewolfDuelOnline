use wwd_core::{State, TOTAL_CROSS, TOTAL_FANG, TOTAL_HOURGLASS};

/// Asserts that every marker is accounted for exactly once.
#[allow(dead_code)]
pub fn assert_conserved(state: &State) {
    let [a, b] = &state.players;
    assert_eq!(
        state.supply.cross + a.cross + b.cross,
        TOTAL_CROSS,
        "crosses"
    );
    assert_eq!(state.supply.fang + a.fang + b.fang, TOTAL_FANG, "fangs");
    assert_eq!(
        state.supply.hourglass + a.hourglass + a.placed + b.hourglass + b.placed,
        TOTAL_HOURGLASS,
        "hourglasses"
    );
    let holders = [state.supply.potion, a.potion, b.potion];
    assert_eq!(holders.iter().filter(|&&h| h).count(), 1, "potion");
}

/// A fresh game with the Badge on `badge` and the given hands and discard.
#[cfg(feature = "unsafe-edit")]
#[allow(dead_code)]
pub fn scenario(
    badge: wwd_core::Seat,
    p0: &[wwd_core::Character],
    p1: &[wwd_core::Character],
    discard: wwd_core::Character,
) -> State {
    use wwd_core::{BadgeStart, Edit, RulesConfig, apply_edit, new_game};

    let config = RulesConfig {
        badge_start: BadgeStart::Seat(badge),
        ..RulesConfig::default()
    };
    let mut state = new_game([0; 32], config);
    apply_edit(
        &mut state,
        Edit::SetHands {
            hands: [p0.to_vec(), p1.to_vec()],
            discard,
        },
    )
    .expect("scenario hands must be valid");
    state
}
