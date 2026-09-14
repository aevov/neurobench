// cascade.rs — Lattice Cascade Projection P48→Λ24→E8→D4→A2→S1
// Maps benchmark scores through the lattice hierarchy for topological classification.

use serde::{Deserialize, Serialize};

/// The six lattice rungs in the cascade hierarchy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LatticeRung {
    /// P48 — Projective lattice (full benchmark space)
    P48,
    /// Λ24 — Leech lattice projection (24-dimensional subspace)
    Lambda24,
    /// E8 — Exceptional lattice (8-dimensional symmetry)
    E8,
    /// D4 — Checkerboard lattice (4-dimensional stability)
    D4,
    /// A2 — Hexagonal lattice (2-dimensional coherence)
    A2,
    /// S1 — Circle (1-dimensional phase order parameter)
    S1,
}

impl LatticeRung {
    pub fn dimension(&self) -> u32 {
        match self {
            LatticeRung::P48 => 48,
            LatticeRung::Lambda24 => 24,
            LatticeRung::E8 => 8,
            LatticeRung::D4 => 4,
            LatticeRung::A2 => 2,
            LatticeRung::S1 => 1,
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            LatticeRung::P48 => "P48",
            LatticeRung::Lambda24 => "Lambda24",
            LatticeRung::E8 => "E8",
            LatticeRung::D4 => "D4",
            LatticeRung::A2 => "A2",
            LatticeRung::S1 => "S1",
        }
    }

    /// Map a wave level (1-7) to a lattice rung.
    pub fn from_wave(wave: u32) -> LatticeRung {
        match wave {
            1 => LatticeRung::S1,
            2 => LatticeRung::A2,
            3 => LatticeRung::D4,
            4 => LatticeRung::E8,
            5 => LatticeRung::Lambda24,
            6 => LatticeRung::P48,
            _ => LatticeRung::P48, // Wave 7+ maps to full lattice
        }
    }
}

/// Cascade projection result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CascadeResult {
    /// The rung the model lands on
    pub rung: LatticeRung,
    /// Dimension of the landing rung
    pub dimension: u32,
    /// Cascade path (all rungs traversed)
    pub path: Vec<String>,
    /// Projection score (normalized to [0, 1])
    pub projection_score: f64,
    /// Packing density at the landing rung
    pub packing_density: f64,
}

/// Project a set of benchmark scores through the lattice cascade.
///
/// The cascade projects scores from the full P48 space down through
/// each sublattice until the score vector "fits" within the packing
/// constraints of a particular rung.
pub fn cascade_project(rcb_score: f64, mti_score: f64, agi_score: f64, r_order: f64) -> CascadeResult {
    // Normalize scores to [0, 1]
    let rcb_norm = (rcb_score / 5.0).max(0.0).min(1.0);
    let mti_norm = mti_score.max(0.0).min(1.0);
    let agi_norm = agi_score.max(0.0).min(1.0);
    let r_norm = r_order.max(0.0).min(1.0);

    // Composite score (weighted average)
    let composite = rcb_norm * 0.3 + mti_norm * 0.25 + agi_norm * 0.25 + r_norm * 0.2;

    // Determine landing rung based on composite score thresholds
    // Each rung has a "packing density" that the score must satisfy
    let rungs = [
        (LatticeRung::S1, 0.15, 0.1636),
        (LatticeRung::A2, 0.30, 0.9069),
        (LatticeRung::D4, 0.45, 0.6169),
        (LatticeRung::E8, 0.60, 0.2537),
        (LatticeRung::Lambda24, 0.80, 0.00216),
        (LatticeRung::P48, 1.00, 0.00001),
    ];

    let mut landing_rung = LatticeRung::P48;
    let mut landing_density = 0.00001;
    let mut path = Vec::new();

    // Cascade down from P48 — find the lowest rung the score qualifies for
    for &(rung, threshold, density) in rungs.iter().rev() {
        path.push(format!("{}(d={})", rung.name(), rung.dimension()));
        if composite >= threshold {
            landing_rung = rung;
            landing_density = density;
            break;
        }
    }

    // If no rung matched, default to S1
    if path.is_empty() {
        path.push("S1(d=1)".to_string());
    }

    CascadeResult {
        rung: landing_rung,
        dimension: landing_rung.dimension(),
        path,
        projection_score: (composite * 1000.0).round() / 1000.0,
        packing_density: landing_density,
    }
}
