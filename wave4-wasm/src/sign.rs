// sign.rs — Cryptographic signing for benchmark reports.
// Uses BLAKE3 keyed MAC for fast, WASM-native report authentication.

use serde::{Deserialize, Serialize};

use crate::hash::{blake3_derive_key, blake3_hash, blake3_mac};

/// A signed benchmark report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedReport {
    /// Report payload (JSON-serializable)
    pub payload: ReportPayload,
    /// BLAKE3 MAC signature (hex)
    pub signature: String,
    /// Signing key fingerprint (hex, first 8 bytes of derived key)
    pub key_fingerprint: String,
    /// Signature algorithm identifier
    pub algorithm: String,
}

/// The report payload containing all benchmark results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportPayload {
    pub benchmark: String,
    pub model: String,
    pub timestamp: String,
    pub suite: String,
    pub version: String,
    pub deployment_token: String,
    pub execution_token: String,
    pub cross_hash: String,
    pub wasm_hash: String,
    pub results: serde_json::Value,
    pub brain_validation: Option<BrainValidation>,
    pub thermodynamic_check: Option<ThermodynamicCheck>,
    pub cascade: Option<CascadeInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainValidation {
    pub order_r: f64,
    pub mean_psi: f64,
    pub coherent: bool,
    pub entropy: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermodynamicCheck {
    pub avg_thermal: f64,
    pub avg_entropy: f64,
    pub in_equilibrium: bool,
    pub density_variance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CascadeInfo {
    pub rung: String,
    pub dimension: u32,
    pub projection_score: f64,
}

/// Signing context — holds the derived key for report signing.
pub struct ReportSigner {
    key: [u8; 32],
    fingerprint: String,
}

impl ReportSigner {
    /// Create a new signer from the deployment token value and WASM hash.
    pub fn new(deployment_token: &str, wasm_hash: &str) -> Self {
        let mut key_material = Vec::new();
        key_material.extend_from_slice(deployment_token.as_bytes());
        key_material.extend_from_slice(wasm_hash.as_bytes());
        let key = blake3_derive_key("wave4/report-signing/v3", &key_material);
        let fingerprint_hash = blake3_hash(&key);
        let fingerprint = fingerprint_hash[..8]
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();
        ReportSigner { key, fingerprint }
    }

    /// Sign a report payload, returning the complete SignedReport.
    pub fn sign(&self, payload: ReportPayload) -> SignedReport {
        let payload_json =
            serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
        let sig = blake3_mac(&self.key, payload_json.as_bytes());
        let sig_hex = sig.iter().map(|b| format!("{:02x}", b)).collect::<String>();

        SignedReport {
            payload,
            signature: sig_hex,
            key_fingerprint: self.fingerprint.clone(),
            algorithm: "BLAKE3-MAC-256".to_string(),
        }
    }

    /// Verify a signed report. Returns true if the signature is valid.
    pub fn verify(report: &SignedReport, deployment_token: &str, wasm_hash: &str) -> bool {
        let signer = ReportSigner::new(deployment_token, wasm_hash);
        let payload_json = serde_json::to_string(&report.payload)
            .unwrap_or_else(|_| "{}".to_string());
        let expected_sig = blake3_mac(&signer.key, payload_json.as_bytes());
        let expected_hex: String =
            expected_sig.iter().map(|b| format!("{:02x}", b)).collect();
        expected_hex == report.signature
    }
}
