use rand_chacha::ChaCha8Rng;
use rand_core::{Rng, SeedableRng};
use serde::{Deserialize, Serialize};

/// Serialisable position in a seeded ChaCha8 stream.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RngState {
    #[serde(with = "crate::hex")]
    pub seed: [u8; 32],
    pub word_pos: u128,
}

impl RngState {
    pub fn new(seed: [u8; 32]) -> Self {
        Self { seed, word_pos: 0 }
    }

    pub fn next_u32(&mut self) -> u32 {
        let mut rng = ChaCha8Rng::from_seed(self.seed);
        rng.set_word_pos(self.word_pos);
        let value = rng.next_u32();
        self.word_pos = rng.get_word_pos();
        value
    }

    /// Uniform value in `[0, n)` by rejection sampling.
    ///
    /// # Panics
    /// Panics if `n` is zero.
    pub fn below(&mut self, n: u32) -> u32 {
        assert!(n > 0, "below(0) has no valid result");
        let zone = u32::MAX - (u32::MAX % n);
        loop {
            let value = self.next_u32();
            if value < zone {
                return value % n;
            }
        }
    }

    /// Fisher–Yates shuffle driven by [`RngState::below`].
    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for i in (1..items.len()).rev() {
            let j = self.below(i as u32 + 1) as usize;
            items.swap(i, j);
        }
    }
}
