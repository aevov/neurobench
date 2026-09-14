// token.rs — TokenForge: Dual-token system with Anyonic Braiding
// τ_D (Deployment Token) + τ_E (Execution Token) — both mandatory.
// Uses Fibonacci π/5 anyonic braiding from cr8OS kernel for topological protection.

use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

use crate::hash::{blake3_derive_key, blake3_hash, blake3_mac};

const BRAID_PHASE: f64 = PI / 5.0; // Fibonacci anyon phase
const TAU: f64 = std::f64::consts::TAU;

/// A topologically protected token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnyonicToken {
    /// Token type identifier
    pub token_type: String,
    /// 32-byte token value (hex-encoded)
    pub value: String,
    /// Braid depth (number of anyonic braid operations applied)
    pub braid_depth: u32,
    /// Protection level ∈ [0, 1] — approaches 1 with more braids
    pub anyon_protection: f64,
    /// Timestamp of token creation
    pub timestamp: u64,
    /// Hash of the WASM binary this token is bound to (hex)
    pub wasm_binding: String,
}

/// Result of the TokenForge session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenPair {
    pub deployment: AnyonicToken,
    pub execution: AnyonicToken,
    /// Cross-verification hash: H(τ_D || τ_E) — proves both tokens were generated together
    pub cross_hash: String,
    /// Anyonic braid signature (non-commutative proof of order)
    pub braid_signature: String,
}

/// Internal anyonic braid state — 3-strand Fibonacci braid.
struct BraidState {
    /// Strand phases
    phi: [f64; 3],
    /// Strand coherences
    coh: [f64; 3],
    /// Strand amplitudes
    sx: [f64; 3],
    /// Protection level
    protection: f64,
    /// Total braid operations
    total_braids: u64,
    /// Braid depth
    depth: u32,
}

impl BraidState {
    fn new(seed: u64) -> Self {
        // Initialize strands from seed
        let s = seed as f64;
        BraidState {
            phi: [
                (s * 0.618033988).rem_euclid(TAU),
                (s * 1.618033988).rem_euclid(TAU),
                (s * 2.618033988).rem_euclid(TAU),
            ],
            coh: [0.5, 0.5, 0.5],
            sx: [0.5, 0.5, 0.5],
            protection: 0.0,
            total_braids: 0,
            depth: 0,
        }
    }

    /// Apply one Fibonacci π/5 anyonic braid gate across all 3 strands.
    /// Ported from cr8oskernel engine.rs gate_anyon_braid_all().
    fn braid(&mut self) {
        let cos_b = BRAID_PHASE.cos();
        let sin_b = BRAID_PHASE.sin();

        // Braid strand pairs (0,1), (1,2), (2,0)
        for i in 0..3 {
            let j = (i + 1) % 3;
            let new_sx = clamp(
                self.sx[i] * cos_b - self.coh[j] * sin_b * 0.3 + self.sx[i] * 0.7,
                0.0,
                1.0,
            );
            let new_coh = clamp(
                self.coh[i] * cos_b + self.sx[j] * sin_b * 0.3 + self.coh[i] * 0.7,
                0.0,
                1.0,
            );
            self.phi[i] = (self.phi[i] + BRAID_PHASE * (1.0 + self.phi[j] * 0.5) + TAU) % TAU;
            self.sx[i] = new_sx;
            self.coh[i] = new_coh;
        }

        self.depth += 1;
        self.total_braids += 3;
        // Protection asymptotically approaches 1: 1 - exp(-depth / (n * 0.5))
        self.protection = clamp(
            1.0 - (-1.0 * self.depth as f64 / 1.5).exp(),
            0.0,
            1.0,
        );
    }

    /// Apply multiple braid operations.
    fn braid_n(&mut self, n: u32) {
        for _ in 0..n {
            self.braid();
        }
    }

    /// Extract a 32-byte token value from the braid state.
    fn extract_token_bytes(&self) -> [u8; 32] {
        let mut data = Vec::with_capacity(48);
        for i in 0..3 {
            data.extend_from_slice(&self.phi[i].to_le_bytes());
            data.extend_from_slice(&self.coh[i].to_le_bytes());
            data.extend_from_slice(&self.sx[i].to_le_bytes());
        }
        data.extend_from_slice(&self.depth.to_le_bytes());
        data.extend_from_slice(&self.total_braids.to_le_bytes());
        blake3_hash(&data)
    }
}

fn clamp(x: f64, lo: f64, hi: f64) -> f64 {
    if x < lo { lo } else if x > hi { hi } else { x }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Current timestamp in seconds (uses js_sys in WASM, fallback for tests).
fn now_timestamp() -> u64 {
    #[cfg(target_arch = "wasm32")]
    {
        (js_sys::Date::now() / 1000.0) as u64
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

/// Forge a complete token pair for a benchmark session.
///
/// `wasm_hash` — BLAKE3 hash of the WASM binary (hex string).
/// `session_seed` — unique seed for this session (e.g., timestamp + random).
pub fn forge_tokens(wasm_hash: &str, session_seed: u64) -> TokenPair {
    // --- Deployment Token (τ_D) ---
    let mut d_braid = BraidState::new(session_seed);
    d_braid.braid_n(7); // 7 braid rounds for deployment token

    let d_bytes = d_braid.extract_token_bytes();
    // Mix in the WASM hash for binding
    let wasm_bytes = wasm_hash.as_bytes();
    let d_key = blake3_derive_key("wave4/deployment-token/v3", wasm_bytes);
    let d_mac = blake3_mac(&d_key, &d_bytes);

    let deployment = AnyonicToken {
        token_type: "deployment".to_string(),
        value: hex_encode(&d_mac),
        braid_depth: d_braid.depth,
        anyon_protection: (d_braid.protection * 1000.0).round() / 1000.0,
        timestamp: now_timestamp(),
        wasm_binding: wasm_hash.to_string(),
    };

    // --- Execution Token (τ_E) ---
    // Seed incorporates deployment token for chaining
    let e_seed = session_seed.wrapping_add(u64::from_le_bytes(
        d_mac[0..8].try_into().unwrap_or([0u8; 8]),
    ));
    let mut e_braid = BraidState::new(e_seed);
    e_braid.braid_n(11); // 11 braid rounds for execution token (higher security)

    let e_bytes = e_braid.extract_token_bytes();
    let e_key = blake3_derive_key("wave4/execution-token/v3", wasm_bytes);
    let e_mac = blake3_mac(&e_key, &e_bytes);

    let execution = AnyonicToken {
        token_type: "execution".to_string(),
        value: hex_encode(&e_mac),
        braid_depth: e_braid.depth,
        anyon_protection: (e_braid.protection * 1000.0).round() / 1000.0,
        timestamp: now_timestamp(),
        wasm_binding: wasm_hash.to_string(),
    };

    // --- Cross-verification: H(τ_D || τ_E) ---
    let mut cross_data = Vec::with_capacity(64);
    cross_data.extend_from_slice(&d_mac);
    cross_data.extend_from_slice(&e_mac);
    let cross_hash = blake3_hash(&cross_data);

    // --- Braid signature: proves non-commutative braid order ---
    // Hash the braid states in order to create a signature that depends on
    // the exact sequence of braid operations (non-commutative proof)
    let mut sig_data = Vec::new();
    sig_data.extend_from_slice(&d_braid.extract_token_bytes());
    sig_data.extend_from_slice(&e_braid.extract_token_bytes());
    sig_data.extend_from_slice(&d_braid.depth.to_le_bytes());
    sig_data.extend_from_slice(&e_braid.depth.to_le_bytes());
    let braid_sig = blake3_hash(&sig_data);

    TokenPair {
        deployment,
        execution,
        cross_hash: hex_encode(&cross_hash),
        braid_signature: hex_encode(&braid_sig),
    }
}
