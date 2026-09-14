// lbm.rs — D3Q19 Lattice Boltzmann Thermodynamic Organism (ported from spu-core)
// Native thermodynamic simulation for behavioral consistency validation.

use serde::{Deserialize, Serialize};

/// D3Q19 velocity vectors (19 discrete velocities in 3D).
pub const D3Q19_V: [[i8; 3]; 19] = [
    [0, 0, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
    [1, 1, 0],
    [-1, -1, 0],
    [1, -1, 0],
    [-1, 1, 0],
    [1, 0, 1],
    [-1, 0, -1],
    [1, 0, -1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, -1],
    [0, 1, -1],
    [0, -1, 1],
];

/// D3Q19 weights: w[0]=1/3, w[1..6]=1/18, w[7..18]=1/36
pub const D3Q19_W: [f64; 19] = [
    1.0 / 3.0,
    1.0 / 18.0,
    1.0 / 18.0,
    1.0 / 18.0,
    1.0 / 18.0,
    1.0 / 18.0,
    1.0 / 18.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
    1.0 / 36.0,
];

/// A single LBM node with 19 distribution functions.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LBMNode {
    pub distribution: [f64; 19],
    pub thermal_load: f64,
    pub entropy_rate: f64,
}

impl LBMNode {
    pub fn new() -> Self {
        let mut dist = [0.0f64; 19];
        // Initialize to equilibrium at rest (ρ=1, u=0)
        for k in 0..19 {
            dist[k] = D3Q19_W[k];
        }
        LBMNode {
            distribution: dist,
            thermal_load: 0.0,
            entropy_rate: 0.0,
        }
    }

    /// Compute macroscopic density ρ = Σ f_k
    pub fn density(&self) -> f64 {
        self.distribution.iter().sum()
    }

    /// Compute macroscopic velocity u = (1/ρ) Σ f_k * c_k
    pub fn velocity(&self) -> [f64; 3] {
        let rho = self.density().max(1e-12);
        let mut u = [0.0f64; 3];
        for k in 0..19 {
            for d in 0..3 {
                u[d] += self.distribution[k] * D3Q19_V[k][d] as f64;
            }
        }
        for d in 0..3 {
            u[d] /= rho;
        }
        u
    }

    /// BGK collision: f_k' = f_k - (f_k - f_k^eq) / τ
    /// τ = 0.5 + thermal_load * 2.0 (viscosity increases with thermal load)
    pub fn collide(&mut self) {
        let rho = self.density();
        let u = self.velocity();
        let tau = 0.5 + self.thermal_load * 2.0;
        let inv_tau = 1.0 / tau.max(0.501);

        for k in 0..19 {
            // Equilibrium: f_k^eq = w_k * ρ * (1 + 3(c_k·u) + 4.5(c_k·u)² - 1.5|u|²)
            let cu = (D3Q19_V[k][0] as f64 * u[0])
                + (D3Q19_V[k][1] as f64 * u[1])
                + (D3Q19_V[k][2] as f64 * u[2]);
            let u2 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
            let feq = D3Q19_W[k] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * u2);
            self.distribution[k] -= (self.distribution[k] - feq) * inv_tau;
            // Clamp to prevent negative distributions
            if self.distribution[k] < 0.0 {
                self.distribution[k] = 0.0;
            }
        }
    }
}

/// Small LBM lattice for benchmark thermodynamic validation.
/// Uses a compact lattice of nodes that are coupled as neighbors.
pub struct LBMLattice {
    pub nodes: Vec<LBMNode>,
    /// Neighbor indices for each node
    pub neighbors: Vec<Vec<usize>>,
    pub size: usize,
}

impl LBMLattice {
    /// Create a new lattice with `size` nodes in a ring topology.
    pub fn new(size: usize) -> Self {
        let n = size.max(4);
        let nodes: Vec<LBMNode> = (0..n).map(|_| LBMNode::new()).collect();

        // Ring topology: each node connected to prev and next
        let mut neighbors = Vec::with_capacity(n);
        for i in 0..n {
            let prev = if i == 0 { n - 1 } else { i - 1 };
            let next = if i == n - 1 { 0 } else { i + 1 };
            neighbors.push(vec![prev, next]);
        }

        LBMLattice {
            nodes,
            neighbors,
            size: n,
        }
    }

    /// Update metabolic state: compute entropy H = -Σ f·ln(f) and cool thermal load.
    pub fn update_metabolic(&mut self) {
        for node in &mut self.nodes {
            let mut h = 0.0f64;
            for k in 0..19 {
                let f = node.distribution[k];
                if f > 1e-15 {
                    h -= f * f.ln();
                }
            }
            node.entropy_rate = h;
            // Passive cooling: thermal load decays toward 0.3 baseline
            node.thermal_load = node.thermal_load * 0.95 + 0.3 * 0.05;
        }
    }

    /// Inject energy into a specific node (simulates workload).
    pub fn inject_energy(&mut self, node_idx: usize, amount: f64) {
        if node_idx < self.size {
            self.nodes[node_idx].thermal_load =
                (self.nodes[node_idx].thermal_load + amount).min(2.0);
        }
    }

    /// One full simulation step: collide all nodes, couple neighbors, update metabolic.
    pub fn step_all(&mut self) {
        // Collision phase
        for node in &mut self.nodes {
            node.collide();
        }

        // Neighbor coupling: exchange thermal load
        let n = self.size;
        let mut thermal_deltas = vec![0.0f64; n];
        for i in 0..n {
            for &j in &self.neighbors[i].clone() {
                let diff = self.nodes[j].thermal_load - self.nodes[i].thermal_load;
                thermal_deltas[i] += diff * 0.05;
            }
        }
        for i in 0..n {
            self.nodes[i].thermal_load += thermal_deltas[i];
            self.nodes[i].thermal_load = self.nodes[i].thermal_load.max(0.0);
        }

        // Metabolic update
        self.update_metabolic();
    }

    /// Run the lattice for `steps` steps and return summary.
    pub fn simulate(&mut self, steps: u32) -> LBMResult {
        for _ in 0..steps {
            self.step_all();
        }
        self.summarize()
    }

    /// Summarize the lattice state.
    pub fn summarize(&self) -> LBMResult {
        let n = self.size as f64;
        let avg_thermal: f64 =
            self.nodes.iter().map(|nd| nd.thermal_load).sum::<f64>() / n;
        let avg_entropy: f64 =
            self.nodes.iter().map(|nd| nd.entropy_rate).sum::<f64>() / n;
        let avg_density: f64 =
            self.nodes.iter().map(|nd| nd.density()).sum::<f64>() / n;
        let max_thermal: f64 =
            self.nodes.iter().map(|nd| nd.thermal_load).fold(0.0f64, f64::max);

        // Equilibrium check: low variance in density ≈ stable thermodynamic state
        let density_variance: f64 = self
            .nodes
            .iter()
            .map(|nd| {
                let d = nd.density() - avg_density;
                d * d
            })
            .sum::<f64>()
            / n;

        LBMResult {
            avg_thermal: (avg_thermal * 1000.0).round() / 1000.0,
            avg_entropy: (avg_entropy * 1000.0).round() / 1000.0,
            avg_density: (avg_density * 1000.0).round() / 1000.0,
            max_thermal: (max_thermal * 1000.0).round() / 1000.0,
            density_variance: (density_variance * 1_000_000.0).round() / 1_000_000.0,
            in_equilibrium: density_variance < 0.01,
            node_count: self.size,
        }
    }
}

/// Result of LBM thermodynamic simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LBMResult {
    pub avg_thermal: f64,
    pub avg_entropy: f64,
    pub avg_density: f64,
    pub max_thermal: f64,
    pub density_variance: f64,
    pub in_equilibrium: bool,
    pub node_count: usize,
}

/// Exportable basic thermodynamic model state (for user download).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermodynamicModel {
    pub version: String,
    pub lattice_type: String,
    pub node_count: usize,
    pub velocity_set: usize,
    pub weights: Vec<f64>,
    pub velocities: Vec<[i8; 3]>,
    pub baseline_state: LBMResult,
}

impl ThermodynamicModel {
    pub fn export_basic() -> Self {
        let mut lattice = LBMLattice::new(8);
        let baseline = lattice.simulate(50);

        ThermodynamicModel {
            version: "4.0.0".to_string(),
            lattice_type: "D3Q19".to_string(),
            node_count: 8,
            velocity_set: 19,
            weights: D3Q19_W.to_vec(),
            velocities: D3Q19_V.to_vec(),
            baseline_state: baseline,
        }
    }
}
