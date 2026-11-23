use serde::Serialize;

pub fn seed_commitment(seed: &[u8; 32]) -> [u8; 32] {
    blake3::hash(seed).into()
}

/// Hashes the canonical postcard encoding of `value`.
pub fn hash_bytes<T: Serialize>(value: &T) -> [u8; 32] {
    let bytes =
        postcard::to_stdvec(value).expect("postcard serialisation of engine types is infallible");
    blake3::hash(&bytes).into()
}
