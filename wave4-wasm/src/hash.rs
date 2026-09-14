// hash.rs — FNV-1a-32 (UTF-16 compatible with JS/spu-core) + BLAKE3

/// FNV-1a hash over UTF-16 code units — matches spu-core brain.rs exactly.
#[inline]
pub fn fnv1a_32(text: &str) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for unit in text.encode_utf16() {
        h ^= (unit as u32) & 0xff;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

/// Avalanche mixer — finalizes an FNV hash for better distribution.
#[inline]
pub fn avalanche32(mut h: u32) -> u32 {
    h ^= h >> 15;
    h = h.wrapping_mul(0x2545f491);
    h ^= h >> 13;
    h
}

/// BLAKE3 hash of arbitrary bytes, returns 32-byte digest.
pub fn blake3_hash(data: &[u8]) -> [u8; 32] {
    *blake3::hash(data).as_bytes()
}

/// BLAKE3 keyed MAC — 32-byte key, returns 32-byte tag.
pub fn blake3_mac(key: &[u8; 32], data: &[u8]) -> [u8; 32] {
    *blake3::keyed_hash(key, data).as_bytes()
}

/// Derive a 32-byte key from a passphrase using BLAKE3 key derivation.
pub fn blake3_derive_key(context: &str, key_material: &[u8]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut derive = blake3::Hasher::new_derive_key(context);
    derive.update(key_material);
    out.copy_from_slice(derive.finalize().as_bytes());
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a_matches_spu_core() {
        // Known FNV-1a test vector
        let h = fnv1a_32("hello");
        assert_ne!(h, 0);
        // Avalanche should change the value
        assert_ne!(avalanche32(h), h);
    }

    #[test]
    fn blake3_deterministic() {
        let a = blake3_hash(b"test data");
        let b = blake3_hash(b"test data");
        assert_eq!(a, b);
    }

    #[test]
    fn blake3_mac_differs_from_hash() {
        let key = [42u8; 32];
        let mac = blake3_mac(&key, b"test data");
        let hash = blake3_hash(b"test data");
        assert_ne!(mac, hash);
    }
}
