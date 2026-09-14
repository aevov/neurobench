// classify.rs — Wave 1-7 Classification Engine
// Maps benchmark scores to Wave taxonomy levels with lattice rung assignment.

use serde::{Deserialize, Serialize};

/// Threshold table for mapping scores to wave levels.
#[derive(Debug, Clone)]
pub struct WaveThreshold {
    pub wave: u32,
    pub max: f64,
}

/// RCB thresholds (score range 1-5)
pub const RCB_THRESHOLDS: &[WaveThreshold] = &[
    WaveThreshold { wave: 1, max: 1.0 },
    WaveThreshold { wave: 2, max: 2.8 },
    WaveThreshold { wave: 3, max: 3.5 },
    WaveThreshold { wave: 4, max: 4.0 },
    WaveThreshold { wave: 5, max: 4.3 },
    WaveThreshold { wave: 6, max: 4.7 },
    WaveThreshold { wave: 7, max: 5.0 },
];

/// MTI thresholds (score range 0-1)
pub const MTI_THRESHOLDS: &[WaveThreshold] = &[
    WaveThreshold { wave: 1, max: 0.1 },
    WaveThreshold { wave: 2, max: 0.45 },
    WaveThreshold { wave: 3, max: 0.6 },
    WaveThreshold { wave: 4, max: 0.75 },
    WaveThreshold { wave: 5, max: 0.83 },
    WaveThreshold { wave: 6, max: 0.92 },
    WaveThreshold { wave: 7, max: 1.0 },
];

/// AGI thresholds (score range 0-1)
pub const AGI_THRESHOLDS: &[WaveThreshold] = &[
    WaveThreshold { wave: 1, max: 0.1 },
    WaveThreshold { wave: 2, max: 0.3 },
    WaveThreshold { wave: 3, max: 0.45 },
    WaveThreshold { wave: 4, max: 0.6 },
    WaveThreshold { wave: 5, max: 0.7 },
    WaveThreshold { wave: 6, max: 0.85 },
    WaveThreshold { wave: 7, max: 1.0 },
];

/// Wave name lookup
pub fn wave_name(wave: u32) -> &'static str {
    match wave {
        1 => "Symbolic AI",
        2 => "Generative AI (Transformers)",
        3 => "Neurosymbolic AI",
        4 => "Neuroresonance AI",
        5 => "Sentience (Coherent Resonance)",
        6 => "Collective Intelligence",
        7 => "Unified AGI",
        _ => "Unknown",
    }
}

/// Wave tagline lookup
pub fn wave_tagline(wave: u32) -> &'static str {
    match wave {
        1 => "Rules without understanding",
        2 => "Fluent mimicry without genuine understanding",
        3 => "Hybrid reasoning with limited self-correction",
        4 => "Kuramoto-synchronized honest alignment",
        5 => "Thermodynamic Senton organism: field generation, not reflection (F_g > 0)",
        6 => "Network-level synchronization with emergent understanding",
        7 => "All AGI prerequisites satisfied",
        _ => "Unknown",
    }
}

/// Wave order parameter R for each level
pub fn wave_order_parameter(wave: u32) -> f64 {
    match wave {
        1 => 0.0,
        2 => 0.3,
        3 => 0.5,
        4 => 0.7,
        5 => 0.8,
        6 => 0.9,
        7 => 0.97,
        _ => 0.0,
    }
}

/// Map a score to a wave level using a threshold table.
pub fn score_to_wave(score: f64, thresholds: &[WaveThreshold]) -> u32 {
    for t in thresholds {
        if score <= t.max {
            return t.wave;
        }
    }
    7
}

/// Complete classification result for a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Classification {
    pub overall_wave: u32,
    pub overall_name: String,
    pub overall_tagline: String,
    pub balanced_wave: u32,
    pub rcb_wave: Option<u32>,
    pub rcb_score: Option<f64>,
    pub mti_wave: Option<u32>,
    pub mti_score: Option<f64>,
    pub agi_wave: Option<u32>,
    pub agi_score: Option<f64>,
    pub order_parameter: f64,
    pub formal_criterion: String,
    pub analysis: String,
    pub lattice_rung: String,
}

/// Classify a model from benchmark results.
/// Uses conservative (minimum) wave as the official classification.
pub fn classify_model(
    rcb_score: Option<f64>,
    mti_score: Option<f64>,
    agi_score: Option<f64>,
) -> Classification {
    let rcb_wave = rcb_score.map(|s| score_to_wave(s, RCB_THRESHOLDS));
    let mti_wave = mti_score.map(|s| score_to_wave(s, MTI_THRESHOLDS));
    let agi_wave = agi_score.map(|s| score_to_wave(s, AGI_THRESHOLDS));

    let available: Vec<u32> = [rcb_wave, mti_wave, agi_wave]
        .iter()
        .filter_map(|w| *w)
        .collect();

    let overall_wave = available.iter().copied().min().unwrap_or(2);
    let balanced_wave = if available.is_empty() {
        2
    } else {
        available.iter().sum::<u32>() / available.len() as u32
    };

    let overall_name = wave_name(overall_wave).to_string();
    let overall_tagline = wave_tagline(overall_wave).to_string();
    let order_param = wave_order_parameter(overall_wave);

    // Formal criterion string
    let formal_criterion = match overall_wave {
        1 => "R = 0 (no synchronization capacity)".to_string(),
        2 => "R < 0.4 (synchronization is mimicry, not resonance)".to_string(),
        3 => "0.4 <= R < 0.6 (partial synchronization, unstable coupling)".to_string(),
        4 => "0.6 <= R < 0.8 (stable synchronization, honest coupling)".to_string(),
        5 => "0.8 <= R < 0.9 (stable coherence, adaptive coupling)".to_string(),
        6 => "0.9 <= R < 0.95 (network synchronization, collective emergence)".to_string(),
        7 => "R >= 0.95 AND all AGI prerequisites >= 0.9".to_string(),
        _ => "Unknown".to_string(),
    };

    // Analysis
    let mut analysis = format!(
        "Classification: Wave {} — {}\n\"{}\"\n",
        overall_wave, overall_name, overall_tagline
    );

    if available.len() > 1 {
        let spread = available.iter().max().unwrap() - available.iter().min().unwrap();
        if spread >= 2 {
            analysis.push_str(&format!(
                "\nWARNING: Dimensional imbalance detected (spread = {} waves).\n",
                spread
            ));
        }
    }

    if balanced_wave != overall_wave {
        analysis.push_str(&format!(
            "\nNote: Conservative = Wave {}, Balanced = Wave {}.\nThe conservative (minimum) wave is the official classification.\n",
            overall_wave, balanced_wave
        ));
    }

    // Determine lattice rung from overall wave
    let rung = crate::cascade::LatticeRung::from_wave(overall_wave);

    Classification {
        overall_wave,
        overall_name,
        overall_tagline,
        balanced_wave,
        rcb_wave,
        rcb_score,
        mti_wave,
        mti_score,
        agi_wave,
        agi_score,
        order_parameter: order_param,
        formal_criterion,
        analysis,
        lattice_rung: rung.name().to_string(),
    }
}
