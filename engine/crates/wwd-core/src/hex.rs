//! Serde helpers for 32-byte values: lowercase hexadecimal strings in human-readable
//! formats such as JSON, and the plain byte array elsewhere, so postcard bytes and hashes
//! are unaffected.

use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

pub fn serialize<S: Serializer>(bytes: &[u8; 32], serializer: S) -> Result<S::Ok, S::Error> {
    if serializer.is_human_readable() {
        serializer.serialize_str(&to_hex(bytes))
    } else {
        bytes.serialize(serializer)
    }
}

pub fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<[u8; 32], D::Error> {
    if deserializer.is_human_readable() {
        let text = String::deserialize(deserializer)?;
        from_hex(&text).ok_or_else(|| D::Error::custom("expected 64 hexadecimal characters"))
    } else {
        <[u8; 32]>::deserialize(deserializer)
    }
}

fn to_hex(bytes: &[u8; 32]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut text = String::with_capacity(64);
    for byte in bytes {
        text.push(char::from(DIGITS[usize::from(byte >> 4)]));
        text.push(char::from(DIGITS[usize::from(byte & 0x0f)]));
    }
    text
}

fn from_hex(text: &str) -> Option<[u8; 32]> {
    let digits = text.as_bytes();
    if digits.len() != 64 {
        return None;
    }
    let mut bytes = [0u8; 32];
    let (pairs, _) = digits.as_chunks::<2>();
    for (byte, pair) in bytes.iter_mut().zip(pairs) {
        let high = char::from(pair[0]).to_digit(16)?;
        let low = char::from(pair[1]).to_digit(16)?;
        *byte = u8::try_from(high << 4 | low).ok()?;
    }
    Some(bytes)
}
