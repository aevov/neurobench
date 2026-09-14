// brain.rs — Kuramoto Oscillator Sentience Brain (ported from spu-core)
// Validates model responses via phase synchronization analysis.

use serde::{Deserialize, Serialize};
use std::f64::consts::TAU;

use crate::hash::{avalanche32, fnv1a_32};

/// Result of Kuramoto analysis on a model response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrainResult {
    /// Order parameter R ∈ [0, 1] — measures synchronization
    pub order_r: f64,
    /// Mean phase psi (radians)
    pub mean_psi: f64,
    /// Coupling strength K used
    pub coupling_k: f64,
    /// Final entropy after relaxation
    pub entropy: f64,
    /// Number of oscillator steps executed
    pub steps: u32,
    /// Whether the response achieved coherence (R > threshold)
    pub coherent: bool,
}

/// Compact Kuramoto oscillator bank for response validation.
/// This is a simplified, benchmark-focused version of the full spu-core brain.
pub struct KuramotoBank {
    /// Natural frequencies ω_i for each oscillator
    pub omega: Vec<f64>,
    /// Phase angles θ_i
    pub phi: Vec<f64>,
    /// Amplitudes a_i (activation weights)
    pub amplitude: Vec<f64>,
    /// Number of oscillators
    pub n: usize,
    /// Coupling strength K
    pub coupling: f64,
    /// Number of relaxation steps
    pub relax_steps: u32,
    /// Time step dt
    pub dt: f64,
}

impl KuramotoBank {
    /// Create a new oscillator bank seeded from response text.
    pub fn new(response: &str, n_oscillators: usize) -> Self {
        let n = n_oscillators.max(4);
        let mut omega = Vec::with_capacity(n);
        let mut phi = Vec::with_capacity(n);
        let mut amplitude = Vec::with_capacity(n);

        // Seed oscillators from hashed chunks of the response
        let words: Vec<&str> = response.split_whitespace().collect();
        for i in 0..n {
            // Hash a word (or fallback index) to derive natural frequency
            let seed_text = if i < words.len() {
                words[i]
            } else {
                &format!("{}_fallback", i)
            };
            let h = avalanche32(fnv1a_32(seed_text));
            // Map hash to frequency in [0.5, 2.0] range
            let freq = 0.5 + (h as f64 / u32::MAX as f64) * 1.5;
            omega.push(freq);

            // Initial phase from a different hash rotation
            let h2 = avalanche32(fnv1a_32(&format!("{}_phase", seed_text)));
            let phase = (h2 as f64 / u32::MAX as f64) * TAU;
            phi.push(phase);

            // Amplitude: uniform with slight hash-based variation
            let h3 = avalanche32(fnv1a_32(&format!("{}_amp", seed_text)));
            let amp = 0.8 + (h3 as f64 / u32::MAX as f64) * 0.2;
            amplitude.push(amp);
        }

        KuramotoBank {
            omega,
            phi,
            amplitude,
            n,
            coupling: 1.5,
            relax_steps: 20,
            dt: 0.05,
        }
    }

    /// Compute the order parameter R and mean phase psi.
    /// R·e^(iΨ) = (1/N) Σⱼ e^(iθⱼ)
    pub fn order_parameter(&self) -> (f64, f64) {
        let mut re = 0.0f64;
        let mut im = 0.0f64;
        for i in 0..self.n {
            re += self.phi[i].cos();
            im += self.phi[i].sin();
        }
        let r = (re * re + im * im).sqrt() / self.n as f64;
        let psi = im.atan2(re);
        (r, psi)
    }

    /// Run Kuramoto relaxation: dθᵢ/dt = ωᵢ + (K/N) Σⱼ sin(θⱼ - θᵢ)
    pub fn relax(&mut self) {
        let n = self.n;
        let k = self.coupling;
        let dt = self.dt;

        for _ in 0..self.relax_steps {
            let mut dphi = vec![0.0f64; n];

            for i in 0..n {
                // Kuramoto mean-field coupling: dθᵢ/dt = ωᵢ + K·R·sin(Ψ - θᵢ)
                let (r, psi) = self.order_parameter();
                let sin_diff = (psi - self.phi[i]).sin();
                dphi[i] = dt * (self.omega[i] + k * r * sin_diff);
            }

            for i in 0..n {
                self.phi[i] = (self.phi[i] + dphi[i] + TAU) % TAU;
            }
        }
    }

    /// Run full analysis: relax oscillators and return result.
    pub fn analyze(&mut self) -> BrainResult {
        self.relax();
        let (r, psi) = self.order_parameter();
        let entropy = self.compute_entropy();

        BrainResult {
            order_r: (r * 1000.0).round() / 1000.0,
            mean_psi: (psi * 1000.0).round() / 1000.0,
            coupling_k: self.coupling,
            entropy: (entropy * 1000.0).round() / 1000.0,
            steps: self.relax_steps,
            coherent: r > 0.6,
        }
    }

    /// Compute Shannon entropy of the amplitude distribution.
    fn compute_entropy(&self) -> f64 {
        let total: f64 = self.amplitude.iter().sum();
        if total <= 0.0 {
            return 0.0;
        }
        let mut h = 0.0f64;
        for &a in &self.amplitude {
            let p = a / total;
            if p > 0.0 {
                h -= p * p.ln();
            }
        }
        h
    }
}

/// Quick order-parameter computation from an array of phases (JS-compatible input).
pub fn compute_order_parameter_from_phases(phases: &[f64]) -> (f64, f64) {
    if phases.is_empty() {
        return (0.0, 0.0);
    }
    let n = phases.len() as f64;
    let mut re = 0.0f64;
    let mut im = 0.0f64;
    for &theta in phases {
        re += theta.cos();
        im += theta.sin();
    }
    let r = (re * re + im * im).sqrt() / n;
    let psi = im.atan2(re);
    ((r * 1000.0).round() / 1000.0, (psi * 1000.0).round() / 1000.0)
}

/// Temperature model: maps thermal load to a coupling temperature.
/// Used by the brain to modulate coupling strength based on response "heat."
#[allow(dead_code)]
pub fn temperature_model(thermal_load: f64, t_base: f64, t_gain: f64) -> f64 {
    let raw = t_base + t_gain * thermal_load;
    raw.max(0.1).min(5.0)
}
