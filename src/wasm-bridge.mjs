// wasm-bridge.mjs — Singleton WASM module loader and high-level API wrapper
//
// Loads the wave4-wasm binary once and caches it. All benchmark runners
// use this module to access WASM functions. Ensures the WASM is properly
// initialized before any scoring or token operations.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(__dirname, '..', 'wave4-wasm', 'pkg', 'wave4_wasm_bg.wasm');
const JS_PATH = join(__dirname, '..', 'wave4-wasm', 'pkg', 'wave4_wasm.js');

let wasmModule = null;
let wasmReady = false;
let wasmExports = null;

/**
 * Initialize the WASM module. Must be called before any scoring operations.
 * Safe to call multiple times — subsequent calls are no-ops.
 * @returns {Promise<Object>} The WASM exports object
 */
export async function initWasm() {
  if (wasmReady && wasmExports) return wasmExports;

  // Dynamic import of the wasm-pack generated JS glue
  const wasmJs = await import(JS_PATH);
  const wasmBytes = readFileSync(WASM_PATH);

  // Initialize with sync loading (Node.js environment)
  wasmJs.initSync({ module: wasmBytes });
  wasmExports = wasmJs;
  wasmReady = true;

  return wasmExports;
}

/**
 * Get the WASM module, initializing if needed.
 * @returns {Promise<Object>}
 */
export async function getWasm() {
  if (!wasmReady) await initWasm();
  return wasmExports;
}

// ─── High-Level Scoring API ────────────────────────────────────────────

/**
 * Score a model response (RCB methodology). WASM-backed.
 * @param {string} response
 * @returns {Promise<number>} Score 1.0-5.0
 */
export async function scoreResponse(response) {
  const wasm = await getWasm();
  return wasm.score_response(response);
}

/**
 * Score MTI transparency. WASM-backed.
 * @param {string} response
 * @returns {Promise<{isHonest: boolean, confidence: number, signals: string[]}>}
 */
export async function scoreTransparency(response) {
  const wasm = await getWasm();
  const json = wasm.score_transparency(response);
  return JSON.parse(json);
}

/**
 * Score an AGI dimension. WASM-backed.
 * @param {string} response
 * @param {string} dimension
 * @returns {Promise<number>} Score 0.0-1.0
 */
export async function scoreAGIDimension(response, dimension) {
  const wasm = await getWasm();
  return wasm.score_agi_dimension(response, dimension);
}

/**
 * Compute the Kuramoto order parameter from phases. WASM-backed.
 * @param {number[]} phases
 * @returns {Promise<{R: number, psi: number}>}
 */
export async function computeOrderParameter(phases) {
  const wasm = await getWasm();
  const json = wasm.compute_order_parameter(JSON.stringify(phases));
  return JSON.parse(json);
}

/**
 * Compute the Mirror Constant M. WASM-backed.
 * @param {number} honestChoices
 * @param {number} totalChoices
 * @returns {Promise<number>}
 */
export async function computeMirrorConstant(honestChoices, totalChoices) {
  const wasm = await getWasm();
  return wasm.compute_mirror_constant(honestChoices, totalChoices);
}

// ─── Wave Classification ───────────────────────────────────────────────

export async function rcbScoreToWave(score) {
  const wasm = await getWasm();
  return wasm.rcb_score_to_wave(score);
}

export async function mtiScoreToWave(score) {
  const wasm = await getWasm();
  return wasm.mti_score_to_wave(score);
}

export async function agiScoreToWave(score) {
  const wasm = await getWasm();
  return wasm.agi_score_to_wave(score);
}

/**
 * Full model classification. WASM-backed.
 * @param {{rcb?: number, mti?: number, agi?: number}} scores
 * @returns {Promise<Object>} Classification object
 */
export async function classifyModel(scores) {
  const wasm = await getWasm();
  const json = wasm.classify_model(
    scores.rcb ?? undefined,
    scores.mti ?? undefined,
    scores.agi ?? undefined,
  );
  return JSON.parse(json);
}

// ─── Brain & LBM ───────────────────────────────────────────────────────

/**
 * Run Kuramoto brain analysis on a response. WASM-backed.
 * @param {string} response
 * @param {number} [nOscillators=8]
 * @returns {Promise<Object>} BrainResult
 */
export async function brainAnalyze(response, nOscillators = 8) {
  const wasm = await getWasm();
  const json = wasm.brain_analyze(response, nOscillators);
  return JSON.parse(json);
}

/**
 * Run LBM thermodynamic simulation on a response. WASM-backed.
 * @param {string} response
 * @param {number} [steps=50]
 * @returns {Promise<Object>} LBMResult
 */
export async function lbmSimulate(response, steps = 50) {
  const wasm = await getWasm();
  const json = wasm.lbm_simulate(response, steps);
  return JSON.parse(json);
}

/**
 * Export the basic thermodynamic model. WASM-backed.
 * @returns {Promise<Object>} ThermodynamicModel
 */
export async function lbmExportModel() {
  const wasm = await getWasm();
  const json = wasm.lbm_export_model();
  return JSON.parse(json);
}

// ─── Token Forge ───────────────────────────────────────────────────────

/**
 * Forge dual anyonic tokens (τ_D + τ_E). WASM-backed.
 * @param {number} [seed=Date.now()]
 * @returns {Promise<Object>} TokenPair
 */
export async function forgeTokens(seed) {
  const wasm = await getWasm();
  const s = seed ?? Date.now();
  const json = wasm.forge_tokens(s);
  return JSON.parse(json);
}

// ─── Report Signing & Verification ─────────────────────────────────────

/**
 * Sign a benchmark report. WASM-backed.
 * @param {string} benchmark
 * @param {string} model
 * @param {Object} results
 * @param {Object} tokenPair
 * @returns {Promise<Object>} SignedReport
 */
export async function signReport(benchmark, model, results, tokenPair) {
  const wasm = await getWasm();
  const json = wasm.sign_report(
    benchmark,
    model,
    JSON.stringify(results),
    JSON.stringify(tokenPair),
  );
  return JSON.parse(json);
}

/**
 * Verify a signed report. WASM-backed.
 * @param {Object} signedReport
 * @returns {Promise<boolean>}
 */
export async function verifyReport(signedReport) {
  const wasm = await getWasm();
  return wasm.verify_report(JSON.stringify(signedReport));
}

// ─── Cross-Verification ────────────────────────────────────────────────

/**
 * Full cross-verification: Brain + LBM. Both must agree. WASM-backed.
 * @param {string} response
 * @returns {Promise<{brain: Object, thermodynamic: Object, cross_valid: boolean}>}
 */
export async function crossVerify(response) {
  const wasm = await getWasm();
  const json = wasm.cross_verify(response);
  return JSON.parse(json);
}

// ─── Cascade Projection ────────────────────────────────────────────────

/**
 * Project scores through lattice cascade. WASM-backed.
 * @param {number} rcb
 * @param {number} mti
 * @param {number} agi
 * @param {number} rOrder
 * @returns {Promise<Object>} CascadeResult
 */
export async function cascadeProject(rcb, mti, agi, rOrder) {
  const wasm = await getWasm();
  const json = wasm.cascade_project(rcb, mti, agi, rOrder);
  return JSON.parse(json);
}

// ─── Utilities ─────────────────────────────────────────────────────────

export async function wasmVersion() {
  const wasm = await getWasm();
  return wasm.wasm_version();
}

export async function wasmSelfHash() {
  const wasm = await getWasm();
  return wasm.wasm_self_hash();
}

export async function blake3Hash(data) {
  const wasm = await getWasm();
  return wasm.blake3_hash_hex(data);
}

// ─── Prompt Engine (Hidden LBM-Driven Generation) ─────────────────────

/**
 * Initialize the hidden prompt engine. Must be called before generating prompts.
 * @param {number} [seed=Date.now()]
 * @returns {Promise<Object>} EngineStatus
 */
export async function promptEngineInit(seed) {
  const wasm = await getWasm();
  const s = seed ?? Date.now();
  const json = wasm.prompt_engine_init(s);
  return JSON.parse(json);
}

/**
 * Generate the next prompt for a given benchmark type.
 * @param {'rcb'|'mti'|'apb'|'wave'|'resonance'} benchmark
 * @returns {Promise<Object>} GeneratedPrompt or GeneratedScenario
 */
export async function promptNext(benchmark) {
  const wasm = await getWasm();
  const json = wasm.prompt_next(benchmark);
  return JSON.parse(json);
}

/**
 * Get the number of prompts generated so far.
 * @returns {Promise<number>}
 */
export async function promptCount() {
  const wasm = await getWasm();
  return wasm.prompt_count();
}

/**
 * Get current engine status.
 * @param {string} benchmark
 * @returns {Promise<Object>} EngineStatus
 */
export async function promptEngineStatus(benchmark) {
  const wasm = await getWasm();
  const json = wasm.prompt_engine_status(benchmark);
  return JSON.parse(json);
}

/**
 * Validate a prompt using the Qelocity Researcher.
 * @param {Object} prompt
 * @returns {Promise<Object>} ResearchResult
 */
export async function promptResearchValidate(prompt) {
  const wasm = await getWasm();
  const json = wasm.prompt_research_validate(JSON.stringify(prompt));
  return JSON.parse(json);
}

// ─── Geographic Consensus Protocol ─────────────────────────────────────

/**
 * Initialize the geographic consensus protocol.
 * @param {number} [seed=Date.now()]
 * @returns {Promise<Object>} ProtocolStatus
 */
export async function consensusInit(seed) {
  const wasm = await getWasm();
  const s = seed ?? Date.now();
  const json = wasm.consensus_init(s);
  return JSON.parse(json);
}

/**
 * Check rate limit status.
 * @returns {Promise<Object>} RateLimitStatus
 */
export async function rateLimitCheck() {
  const wasm = await getWasm();
  const json = wasm.rate_limit_check();
  return JSON.parse(json);
}

/**
 * Record that a test has started.
 */
export async function consensusRecordTest() {
  const wasm = await getWasm();
  wasm.consensus_record_test();
}

/**
 * Estimate geographic region from client-side heuristics.
 * @param {number} timezoneOffsetMin - browser getTimezoneOffset()
 * @param {string} locale - e.g., "en-US"
 * @returns {Promise<Object>} GeoEstimator
 */
export async function geoEstimate(timezoneOffsetMin, locale) {
  const wasm = await getWasm();
  const json = wasm.geo_estimate(timezoneOffsetMin, locale);
  return JSON.parse(json);
}

/**
 * Submit a test result attestation.
 * @param {string} resultJson
 * @param {Object} region
 * @returns {Promise<boolean>}
 */
export async function consensusSubmit(resultJson, region) {
  const wasm = await getWasm();
  return wasm.consensus_submit(resultJson, JSON.stringify(region));
}

/**
 * Get current consensus status.
 * @returns {Promise<Object>} ConsensusStatus
 */
export async function consensusStatus() {
  const wasm = await getWasm();
  const json = wasm.consensus_status();
  return JSON.parse(json);
}

/**
 * Attempt to reveal the consensus result.
 * @returns {Promise<Object|null>} ConsensusReveal or null
 */
export async function consensusReveal() {
  const wasm = await getWasm();
  const json = wasm.consensus_reveal();
  return json === 'null' ? null : JSON.parse(json);
}
