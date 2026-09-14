// consensus.rs — Geographic Consensus Protocol
// Serverless consensus via gossip + BIDC + timing heuristics.
// Rate limiting: 5400s (1:30) minimum between tests, 10800s (3h) between sessions.
// Geographic diversity: probabilistic hidden threshold, oscillating.
// Results revealed only when consensus threshold is met across diverse regions.

use serde::{Deserialize, Serialize};

use crate::hash::{avalanche32, blake3_hash, fnv1a_32};

// ─── Constants ─────────────────────────────────────────────────────────

/// Minimum interval between individual test runs (1 hour 30 minutes in ms)
const MIN_INTERVAL_MS: f64 = 5_400_000.0;
/// Cooldown between full benchmark sessions (3 hours in ms)
const SESSION_COOLDOWN_MS: f64 = 10_800_000.0;
/// Number of geographic regions for diversity tracking
const REGION_COUNT: usize = 7;
/// Bloom filter size for gossip dedup
const BLOOM_SIZE: usize = 64;
/// Gossip fan-out factor (√N approximation)
const GOSSIP_FANOUT: usize = 3;

// ─── Rate Limiter ──────────────────────────────────────────────────────

/// Rate limiter enforcing minimum intervals between benchmark tests.
#[derive(Debug, Clone)]
pub struct RateLimiter {
    /// Timestamp of last test start (ms since epoch)
    last_test_ms: f64,
    /// Timestamp of last full session completion
    last_session_ms: f64,
    /// Number of tests completed in current session
    session_test_count: u32,
}

impl RateLimiter {
    pub fn new() -> Self {
        RateLimiter {
            last_test_ms: 0.0,
            last_session_ms: 0.0,
            session_test_count: 0,
        }
    }

    /// Check if a test can be started now. Returns (allowed, wait_ms_remaining).
    pub fn check(&self, now_ms: f64) -> (bool, f64) {
        // Check minimum interval between tests
        let since_last_test = now_ms - self.last_test_ms;
        if self.last_test_ms > 0.0 && since_last_test < MIN_INTERVAL_MS {
            return (false, MIN_INTERVAL_MS - since_last_test);
        }

        // Check session cooldown
        let since_session = now_ms - self.last_session_ms;
        if self.last_session_ms > 0.0 && since_session < SESSION_COOLDOWN_MS
            && self.session_test_count > 0
        {
            return (false, SESSION_COOLDOWN_MS - since_session);
        }

        (true, 0.0)
    }

    /// Record that a test has started.
    pub fn record_test_start(&mut self, now_ms: f64) {
        self.last_test_ms = now_ms;
        self.session_test_count += 1;
    }

    /// Record that a full session has completed.
    pub fn record_session_complete(&mut self, now_ms: f64) {
        self.last_session_ms = now_ms;
        self.session_test_count = 0;
    }

    /// Get rate limit status.
    pub fn status(&self, now_ms: f64) -> RateLimitStatus {
        let (allowed, wait_ms) = self.check(now_ms);
        RateLimitStatus {
            allowed,
            wait_ms: (wait_ms / 1000.0).round() as u64,
            last_test_ago_s: if self.last_test_ms > 0.0 {
                ((now_ms - self.last_test_ms) / 1000.0).round() as u64
            } else {
                0
            },
            last_session_ago_s: if self.last_session_ms > 0.0 {
                ((now_ms - self.last_session_ms) / 1000.0).round() as u64
            } else {
                0
            },
            session_test_count: self.session_test_count,
            min_interval_s: (MIN_INTERVAL_MS / 1000.0) as u64,
            session_cooldown_s: (SESSION_COOLDOWN_MS / 1000.0) as u64,
        }
    }
}

/// Rate limit status exposed to JS.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitStatus {
    pub allowed: bool,
    pub wait_ms: u64,
    pub last_test_ago_s: u64,
    pub last_session_ago_s: u64,
    pub session_test_count: u32,
    pub min_interval_s: u64,
    pub session_cooldown_s: u64,
}

// ─── Geographic Estimator ──────────────────────────────────────────────

/// Estimated geographic region from timing and locale heuristics.
/// No actual geolocation — only probabilistic region hashing.
#[derive(Debug, Clone)]
pub struct GeoEstimator {
    /// Hash of the estimated region (not a real location)
    pub region_hash: String,
    /// Region index (0..REGION_COUNT)
    pub region_index: usize,
    /// Confidence in the estimation
    pub confidence: f64,
}

/// Estimate a region from timing and timezone offset heuristics.
pub fn estimate_region(timezone_offset_min: f64, locale_hash: u32, entropy_seed: u32) -> GeoEstimator {
    // Map timezone offset to a rough region index
    // UTC-12 to UTC+14 mapped to 0..REGION_COUNT
    let tz_normalized = ((timezone_offset_min + 720.0) / (1440.0 + 840.0) * REGION_COUNT as f64)
        .max(0.0)
        .min(REGION_COUNT as f64 - 0.01);
    let tz_region = tz_normalized as usize;

    // Mix locale hash for additional entropy
    let locale_mix = avalanche32(locale_hash.wrapping_add(entropy_seed));
    let region_index = (tz_region + (locale_mix as usize % 3)) % REGION_COUNT;

    // Create a deterministic but opaque region hash
    let hash_input = format!("region_{}_{}_{}", region_index, locale_mix, entropy_seed);
    let region_hash_bytes = blake3_hash(hash_input.as_bytes());
    let region_hash = region_hash_bytes[..8]
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();

    // Confidence based on entropy mixing
    let confidence = 0.4 + (locale_mix % 100) as f64 / 200.0;

    GeoEstimator {
        region_hash,
        region_index,
        confidence: (confidence * 1000.0).round() / 1000.0,
    }
}

// ─── Gossip Mesh (simplified AevMesh + BIDC) ───────────────────────────

/// A gossip message attestation for cross-region consensus.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GossipAttestation {
    /// Region hash of the attesting node
    pub region_hash: String,
    /// BLAKE3 hash of the test result
    pub result_hash: String,
    /// BIDC-transformed shard
    pub shard: Vec<u8>,
    /// Ed25519-style attestation (simplified: BLAKE3 MAC)
    pub attestation: String,
    /// Timestamp of attestation
    pub timestamp_ms: f64,
}

/// Bloom filter for gossip deduplication.
#[derive(Debug, Clone)]
pub struct BloomFilter {
    bits: [u64; BLOOM_SIZE / 8],
}

impl BloomFilter {
    pub fn new() -> Self {
        BloomFilter {
            bits: [0u64; BLOOM_SIZE / 8],
        }
    }

    /// Insert a hash into the Bloom filter. Returns true if it was new.
    pub fn insert(&mut self, hash: u32) -> bool {
        let mut was_new = false;
        for k in 0..3 {
            let bit_idx = (hash.wrapping_mul(0x9E3779B9u32.wrapping_add(k as u32 * 0x517CC1A7u32)))
                as usize
                % (BLOOM_SIZE * 8);
            let word = bit_idx / 64;
            let bit = bit_idx % 64;
            if self.bits[word] & (1u64 << bit) == 0 {
                was_new = true;
            }
            self.bits[word] |= 1u64 << bit;
        }
        was_new
    }

    /// Check if a hash might be in the filter.
    pub fn contains(&self, hash: u32) -> bool {
        for k in 0..3 {
            let bit_idx = (hash.wrapping_mul(0x9E3779B9u32.wrapping_add(k as u32 * 0x517CC1A7u32)))
                as usize
                % (BLOOM_SIZE * 8);
            let word = bit_idx / 64;
            let bit = bit_idx % 64;
            if self.bits[word] & (1u64 << bit) == 0 {
                return false;
            }
        }
        true
    }
}

// ─── BIDC Transform (Binary Irrational Data Codec) ─────────────────────

/// XOR-based BIDC transform using irrational seeds (π, e, φ).
/// Symmetric: applying twice returns original data.
fn bidc_transform(data: &[u8], seed: f64) -> Vec<u8> {
    let pi_seed: u8 = ((seed * std::f64::consts::PI * 256.0) as u32 % 256) as u8;
    let e_seed: u8 = ((seed * std::f64::consts::E * 256.0) as u32 % 256) as u8;
    let phi_seed: u8 = ((seed * 1.618033988749895 * 256.0) as u32 % 256) as u8;

    data.iter()
        .enumerate()
        .map(|(i, &byte)| {
            let key = match i % 3 {
                0 => pi_seed,
                1 => e_seed,
                2 => phi_seed,
                _ => 0,
            };
            byte ^ key ^ fnv1a_32(&format!("{}_{}", i, seed)).to_le_bytes()[0]
        })
        .collect()
}

// ─── Consensus State ───────────────────────────────────────────────────

/// Tracks attestation shards from different regions for consensus.
#[derive(Debug, Clone)]
pub struct ConsensusTracker {
    /// Attestations collected from different regions
    pub attestations: Vec<GossipAttestation>,
    /// Unique regions that have attested
    pub regions_seen: Vec<String>,
    /// Bloom filter for dedup
    bloom: BloomFilter,
    /// Diversity threshold (hidden, oscillating)
    diversity_threshold: usize,
    /// Oscillation seed for threshold
    oscillation_seed: u32,
}

impl ConsensusTracker {
    pub fn new(oscillation_seed: u32) -> Self {
        // Hidden oscillating threshold: base 3, oscillates ±1
        let base_threshold = 3;
        let osc = (oscillation_seed % 3) as usize;
        let diversity_threshold = base_threshold + osc;

        ConsensusTracker {
            attestations: Vec::new(),
            regions_seen: Vec::new(),
            bloom: BloomFilter::new(),
            diversity_threshold: diversity_threshold.min(REGION_COUNT),
            oscillation_seed,
        }
    }

    /// Submit a test result attestation. Returns whether it was new.
    pub fn submit(&mut self, attestation: GossipAttestation) -> bool {
        let hash = fnv1a_32(&attestation.result_hash);

        // Dedup via Bloom filter
        if !self.bloom.insert(hash) {
            return false; // Already seen
        }

        // Track unique regions
        if !self.regions_seen.contains(&attestation.region_hash) {
            self.regions_seen.push(attestation.region_hash.clone());
        }

        self.attestations.push(attestation);
        true
    }

    /// Check if consensus has been reached (enough diverse regions attested).
    pub fn has_consensus(&self) -> bool {
        self.regions_seen.len() >= self.diversity_threshold
    }

    /// Get the current consensus status.
    pub fn status(&self) -> ConsensusStatus {
        ConsensusStatus {
            attestations_count: self.attestations.len() as u32,
            unique_regions: self.regions_seen.len() as u32,
            diversity_threshold: self.diversity_threshold as u32,
            consensus_reached: self.has_consensus(),
            regions_needed: self
                .diversity_threshold
                .saturating_sub(self.regions_seen.len()) as u32,
        }
    }

    /// Reveal consensus result (only valid if consensus reached).
    pub fn reveal(&self) -> Option<ConsensusReveal> {
        if !self.has_consensus() {
            return None;
        }

        // Combine all attestation shards via XOR
        let mut combined = vec![0u8; 32];
        for att in &self.attestations {
            for (i, byte) in att.shard.iter().enumerate() {
                if i < combined.len() {
                    combined[i] ^= byte;
                }
            }
        }

        let combined_hash = combined
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();

        Some(ConsensusReveal {
            consensus_hash: combined_hash,
            attestation_count: self.attestations.len() as u32,
            region_count: self.regions_seen.len() as u32,
            verified: true,
        })
    }
}

/// Consensus status exposed to JS.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusStatus {
    pub attestations_count: u32,
    pub unique_regions: u32,
    pub diversity_threshold: u32,
    pub consensus_reached: bool,
    pub regions_needed: u32,
}

/// Consensus reveal result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsensusReveal {
    pub consensus_hash: String,
    pub attestation_count: u32,
    pub region_count: u32,
    pub verified: bool,
}

// ─── Full Consensus Protocol ───────────────────────────────────────────

/// The full consensus protocol combining rate limiter, geo estimation,
/// gossip mesh, and consensus tracking.
pub struct ConsensusProtocol {
    pub rate_limiter: RateLimiter,
    pub consensus: ConsensusTracker,
    session_seed: u64,
}

impl ConsensusProtocol {
    pub fn new(session_seed: u64) -> Self {
        let osc_seed = avalanche32(fnv1a_32(&format!("consensus_{}", session_seed)));
        ConsensusProtocol {
            rate_limiter: RateLimiter::new(),
            consensus: ConsensusTracker::new(osc_seed),
            session_seed,
        }
    }

    /// Check rate limit. Returns (allowed, wait_seconds).
    pub fn check_rate_limit(&self, now_ms: f64) -> (bool, f64) {
        self.rate_limiter.check(now_ms)
    }

    /// Record a test start (advances rate limiter).
    pub fn record_test(&mut self, now_ms: f64) {
        self.rate_limiter.record_test_start(now_ms);
    }

    /// Estimate region from client-side heuristics.
    pub fn estimate_region(
        &self,
        timezone_offset_min: f64,
        locale_tag: &str,
    ) -> GeoEstimator {
        let locale_hash = fnv1a_32(locale_tag);
        let entropy = avalanche32(fnv1a_32(&format!("{}_{}", self.session_seed, locale_hash)));
        estimate_region(timezone_offset_min, locale_hash, entropy)
    }

    /// Create an attestation for a test result.
    pub fn create_attestation(
        &self,
        result_json: &str,
        region: &GeoEstimator,
        now_ms: f64,
    ) -> GossipAttestation {
        // Hash the result
        let result_hash_bytes = blake3_hash(result_json.as_bytes());
        let result_hash = result_hash_bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();

        // Create BIDC shard from result hash
        let shard_data = bidc_transform(&result_hash_bytes, region.confidence);

        // Create attestation (simplified Ed25519: BLAKE3 MAC with session key)
        let mac_key = crate::hash::blake3_derive_key(
            "wave4-consensus-attestation",
            &format!("{}_{}", self.session_seed, region.region_hash).as_bytes(),
        );
        let attestation_bytes = crate::hash::blake3_mac(&mac_key, result_json.as_bytes());
        let attestation = attestation_bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();

        GossipAttestation {
            region_hash: region.region_hash.clone(),
            result_hash,
            shard: shard_data,
            attestation,
            timestamp_ms: now_ms,
        }
    }

    /// Submit an attestation to the consensus tracker.
    pub fn submit_attestation(&mut self, attestation: GossipAttestation) -> bool {
        self.consensus.submit(attestation)
    }

    /// Check if consensus has been reached.
    pub fn has_consensus(&self) -> bool {
        self.consensus.has_consensus()
    }

    /// Reveal the consensus result (None if not yet reached).
    pub fn reveal(&self) -> Option<ConsensusReveal> {
        self.consensus.reveal()
    }

    /// Record session completion (advances session cooldown).
    pub fn record_session_complete(&mut self, now_ms: f64) {
        self.rate_limiter.record_session_complete(now_ms);
    }

    /// Get full protocol status.
    pub fn full_status(&self, now_ms: f64) -> ProtocolStatus {
        ProtocolStatus {
            rate_limit: self.rate_limiter.status(now_ms),
            consensus: self.consensus.status(),
        }
    }
}

/// Full protocol status combining rate limit and consensus.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolStatus {
    pub rate_limit: RateLimitStatus,
    pub consensus: ConsensusStatus,
}

// ─── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limiter_allows_first_test() {
        let rl = RateLimiter::new();
        let (allowed, _) = rl.check(1000.0);
        assert!(allowed, "First test should always be allowed");
    }

    #[test]
    fn rate_limiter_blocks_rapid_tests() {
        let mut rl = RateLimiter::new();
        rl.record_test_start(1000.0);
        let (allowed, wait_ms) = rl.check(2000.0); // 1 second later
        assert!(!allowed, "Should block tests within minimum interval");
        assert!(wait_ms > 0.0);
    }

    #[test]
    fn rate_limiter_allows_after_interval() {
        let mut rl = RateLimiter::new();
        rl.record_test_start(1000.0);
        let (allowed, _) = rl.check(1000.0 + MIN_INTERVAL_MS + 1.0);
        assert!(allowed, "Should allow after minimum interval");
    }

    #[test]
    fn rate_limiter_enforces_session_cooldown() {
        let mut rl = RateLimiter::new();
        rl.record_test_start(1000.0);
        rl.record_session_complete(2000.0);
        rl.session_test_count = 1; // Simulate new session started
        let (allowed, _) = rl.check(3000.0); // 1 second after session end
        assert!(!allowed, "Should enforce session cooldown");
    }

    #[test]
    fn geo_estimator_produces_valid_region() {
        let geo = estimate_region(-300.0, 12345, 67890); // UTC-5
        assert!(geo.region_index < REGION_COUNT);
        assert!(!geo.region_hash.is_empty());
        assert!(geo.confidence > 0.0 && geo.confidence <= 1.0);
    }

    #[test]
    fn geo_estimator_different_timezones_give_different_regions() {
        let g1 = estimate_region(0.0, 11111, 22222); // UTC+0
        let g2 = estimate_region(-480.0, 11111, 22222); // UTC-8
        // Different timezones should usually map to different regions
        // (not guaranteed due to locale mixing, but very likely)
        assert!(g1.region_index != g2.region_index || g1.region_hash != g2.region_hash);
    }

    #[test]
    fn bloom_filter_dedup() {
        let mut bloom = BloomFilter::new();
        assert!(bloom.insert(42), "First insert should be new");
        assert!(!bloom.insert(42), "Duplicate should be detected");
        assert!(bloom.contains(42), "Should contain inserted value");
    }

    #[test]
    fn bidc_transform_is_symmetric() {
        let data = b"hello world test data";
        let seed = 3.14159;
        let encoded = bidc_transform(data, seed);
        let decoded = bidc_transform(&encoded, seed);
        assert_eq!(&decoded, data, "BIDC should be symmetric (XOR-based)");
    }

    #[test]
    fn consensus_requires_diverse_regions() {
        let mut tracker = ConsensusTracker::new(42);

        // Submit from same region multiple times
        for i in 0..5 {
            let att = GossipAttestation {
                region_hash: "region_a".to_string(),
                result_hash: format!("hash_{}", i),
                shard: vec![i as u8; 32],
                attestation: format!("att_{}", i),
                timestamp_ms: i as f64 * 1000.0,
            };
            tracker.submit(att);
        }

        // Should NOT have consensus — all from same region
        assert!(!tracker.has_consensus());
        assert_eq!(tracker.regions_seen.len(), 1);
    }

    #[test]
    fn consensus_reached_with_diverse_regions() {
        let mut tracker = ConsensusTracker::new(0); // threshold = 3

        for i in 0..4 {
            let att = GossipAttestation {
                region_hash: format!("region_{}", i),
                result_hash: format!("hash_{}", i),
                shard: vec![i as u8; 32],
                attestation: format!("att_{}", i),
                timestamp_ms: i as f64 * 1000.0,
            };
            tracker.submit(att);
        }

        assert!(tracker.has_consensus());
    }

    #[test]
    fn consensus_reveal_works() {
        let mut tracker = ConsensusTracker::new(0);

        for i in 0..4 {
            let att = GossipAttestation {
                region_hash: format!("region_{}", i),
                result_hash: format!("hash_{}", i),
                shard: vec![i as u8; 32],
                attestation: format!("att_{}", i),
                timestamp_ms: i as f64 * 1000.0,
            };
            tracker.submit(att);
        }

        let reveal = tracker.reveal();
        assert!(reveal.is_some());
        let r = reveal.unwrap();
        assert!(r.verified);
        assert_eq!(r.attestation_count, 4);
        assert_eq!(r.region_count, 4);
    }

    #[test]
    fn full_protocol_flow() {
        let mut protocol = ConsensusProtocol::new(42);

        // First test should be allowed
        let (allowed, _) = protocol.check_rate_limit(1000.0);
        assert!(allowed);

        // Record a test
        protocol.record_test(1000.0);

        // Estimate region
        let geo = protocol.estimate_region(-300.0, "en_US");
        assert!(!geo.region_hash.is_empty());

        // Create and submit attestation
        let att = protocol.create_attestation(
            r#"{"score": 3.5}"#,
            &geo,
            1000.0,
        );
        let submitted = protocol.submit_attestation(att);
        assert!(submitted);

        // Should not have consensus yet (need more regions)
        assert!(!protocol.has_consensus());
    }

    #[test]
    fn rate_limit_status_reports_correct_values() {
        let rl = RateLimiter::new();
        let status = rl.status(5000.0);
        assert!(status.allowed);
        assert_eq!(status.min_interval_s, 5400);
        assert_eq!(status.session_cooldown_s, 10800);
    }
}
