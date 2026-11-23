use wwd_core::{Character, RngState, seed_commitment};

#[test]
fn same_seed_same_sequence() {
    let mut a = RngState::new([7; 32]);
    let mut b = RngState::new([7; 32]);
    for _ in 0..100 {
        assert_eq!(a.below(8), b.below(8));
    }
}

#[test]
fn serialise_roundtrip_preserves_stream() {
    let mut a = RngState::new([3; 32]);
    for _ in 0..5 {
        a.next_u32();
    }
    let mut b: RngState = serde_json::from_str(&serde_json::to_string(&a).unwrap()).unwrap();
    assert_eq!(a, b);
    let from_a: Vec<u32> = (0..5).map(|_| a.next_u32()).collect();
    let from_b: Vec<u32> = (0..5).map(|_| b.next_u32()).collect();
    assert_eq!(from_a, from_b);
}

#[test]
fn shuffle_is_permutation_and_golden() {
    let mut order = Character::ALL;
    RngState::new([1; 32]).shuffle(&mut order);
    let mut sorted = order;
    sorted.sort();
    let mut expected = Character::ALL;
    expected.sort();
    assert_eq!(sorted, expected);
    let golden = [
        Character::Wolfen,
        Character::Seer,
        Character::Villager,
        Character::Hunter,
        Character::WolfKing,
        Character::Knight,
        Character::WolfBeauty,
        Character::Witch,
    ];
    assert_eq!(order, golden);
}

#[test]
fn below_is_unbiased_enough() {
    let mut rng = RngState::new([9; 32]);
    let mut counts = [0u32; 8];
    for _ in 0..80_000 {
        counts[rng.below(8) as usize] += 1;
    }
    for count in counts {
        assert!((9_500..=10_500).contains(&count), "{counts:?}");
    }
}

#[test]
fn commitment_is_blake3() {
    let expected: [u8; 32] = blake3::hash(&[0; 32]).into();
    assert_eq!(seed_commitment(&[0; 32]), expected);
}

#[test]
fn byte_arrays_are_hex_in_json_only() {
    let mut seed = [0u8; 32];
    seed[0] = 0xab;
    seed[31] = 0x0f;
    let rng = RngState::new(seed);
    let json = serde_json::to_value(&rng).unwrap();
    let expected = format!("ab{}0f", "00".repeat(30));
    assert_eq!(json["seed"], expected.as_str());
    assert_eq!(serde_json::from_value::<RngState>(json).unwrap(), rng);
    assert_eq!(
        serde_json::from_value::<RngState>(
            serde_json::json!({ "seed": expected.to_uppercase(), "word_pos": 0 })
        )
        .unwrap(),
        rng
    );
    for bad in ["ab", "zz".repeat(32).as_str(), &format!("{expected}00")] {
        let json = serde_json::json!({ "seed": bad, "word_pos": 0 });
        assert!(serde_json::from_value::<RngState>(json).is_err(), "{bad}");
    }

    // Postcard keeps the plain 32 bytes, so hashes are unaffected by the JSON form.
    let bytes = postcard::to_stdvec(&rng).unwrap();
    assert_eq!(&bytes[..32], &seed);
    assert_eq!(postcard::from_bytes::<RngState>(&bytes).unwrap(), rng);
}

#[test]
fn per_draw_stream_matches_one_continuous_chacha8() {
    use rand_chacha::ChaCha8Rng;
    use rand_core::{Rng, SeedableRng};

    let seed = [42; 32];
    let mut continuous = ChaCha8Rng::from_seed(seed);
    let mut stepped = RngState::new(seed);
    for draw in 0..48 {
        if draw == 24 {
            let json = serde_json::to_string(&stepped).unwrap();
            stepped = serde_json::from_str(&json).unwrap();
            let bytes = postcard::to_stdvec(&stepped).unwrap();
            stepped = postcard::from_bytes(&bytes).unwrap();
        }
        assert_eq!(stepped.next_u32(), continuous.next_u32(), "draw {draw}");
    }
    assert_eq!(stepped.word_pos, continuous.get_word_pos());
}
