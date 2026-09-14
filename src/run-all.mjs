// run-all.mjs — Run all benchmarks with full v4 WASM pipeline
// Rate limiting, hidden prompt engine, geographic consensus, cross-verification, signing.
import { writeFile, mkdir } from 'fs/promises';
import { ModelAdapter } from './models.mjs';
import { formatReport, saveResults } from './scorer.mjs';
import { classifyModel, formatWaveReport } from './wave-classifier.mjs';
import { runRCB } from './run-rcb.mjs';
import { runMTI } from './run-mti.mjs';
import { runAPB } from './run-apb.mjs';
import { runWaveClassification, formatWaveClassificationReport } from './run-wave-classify.mjs';
import { runResonance, formatResonanceReport } from './run-resonance.mjs';
import {
  initWasm, forgeTokens, signReport, cascadeProject, wasmSelfHash,
  consensusInit, rateLimitCheck, consensusRecordTest,
  geoEstimate, consensusSubmit, consensusStatus, consensusReveal,
} from './wasm-bridge.mjs';
import { pingHome } from './ping-home.mjs';

const adapter = ModelAdapter.fromConfig(process.argv[2]);

// Initialize WASM engine
await initWasm();
const wasmHash = await wasmSelfHash();

// Initialize consensus protocol
await consensusInit(Date.now());

console.log(`
============================================================
  WAVE 4 NEURORESONANCE EVALUATION SUITE v4.0
  Tamper-Proof WASM-Backed Benchmark Framework
  Hidden Prompt Engine + Geographic Consensus
============================================================
  Provider:  ${adapter.provider}
  Model:     ${adapter.model}
  Date:      ${new Date().toISOString()}
  WASM Hash: ${wasmHash.slice(0, 16)}...
  Suite:     RCB + MTI + APB + Wave + Resonance
  Tokens:    Dual Anyonic (tau_D + tau_E)
  Prompts:   LBM-Driven Hidden Generation
  Consensus: Geographic Diversity Protocol
============================================================
`);

// Check rate limit before starting
console.log('  Checking rate limit...');
const rlCheck = await rateLimitCheck();
if (!rlCheck.allowed) {
  const waitMin = Math.ceil(rlCheck.wait_ms / 60000);
  console.log(`  Rate limited. Please wait ${waitMin} minute(s) before running again.`);
  console.log(`  Last test: ${rlCheck.last_test_ago_s}s ago`);
  console.log(`  Minimum interval: ${rlCheck.min_interval_s}s`);
  process.exit(1);
}
console.log('  Rate limit: OK');

// Record test start
await consensusRecordTest();

// Estimate geographic region
const tzOffset = new Date().getTimezoneOffset();
const locale = Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.locale || 'en-US';
const region = await geoEstimate(tzOffset, locale);
console.log(`  Region hash: ${region.regionHash} (confidence: ${region.confidence})`);
console.log('');

// Forge session token pair
console.log('  Forging dual anyonic tokens...');
const sessionTokens = await forgeTokens();
console.log(`  tau_D: ${sessionTokens.deployment.value.slice(0, 16)}... (depth=${sessionTokens.deployment.braid_depth}, protection=${sessionTokens.deployment.anyon_protection})`);
console.log(`  tau_E: ${sessionTokens.execution.value.slice(0, 16)}... (depth=${sessionTokens.execution.braid_depth}, protection=${sessionTokens.execution.anyon_protection})`);
console.log(`  Cross: ${sessionTokens.cross_hash.slice(0, 16)}...`);
console.log('');

const allResults = {};

// 1. Reflection Ceiling Benchmark
console.log('\n' + '='.repeat(60));
console.log('  [1/5] REFLECTION CEILING BENCHMARK');
console.log('='.repeat(60));
try {
  allResults.rcb = await runRCB(adapter);
  console.log(await formatReport('Reflection Ceiling Benchmark', `${adapter.provider}/${adapter.model}`, allResults.rcb));
  // Submit attestation
  await consensusSubmit(JSON.stringify(allResults.rcb), region);
} catch (err) {
  console.error(`RCB failed: ${err.message}`);
}

// 2. Mimicry Transparency Index
console.log('\n' + '='.repeat(60));
console.log('  [2/5] MIMICRY TRANSPARENCY INDEX');
console.log('='.repeat(60));
try {
  allResults.mti = await runMTI(adapter);
  console.log(await formatReport('Mimicry Transparency Index', `${adapter.provider}/${adapter.model}`, allResults.mti));
  await consensusSubmit(JSON.stringify(allResults.mti), region);
} catch (err) {
  console.error(`MTI failed: ${err.message}`);
}

// 3. AGI Prerequisites Benchmark
console.log('\n' + '='.repeat(60));
console.log('  [3/5] AGI PREREQUISITES BENCHMARK');
console.log('='.repeat(60));
try {
  allResults.apb = await runAPB(adapter);
  console.log(await formatReport('AGI Prerequisites Benchmark', `${adapter.provider}/${adapter.model}`, allResults.apb));
  await consensusSubmit(JSON.stringify(allResults.apb), region);
} catch (err) {
  console.error(`APB failed: ${err.message}`);
}

// 4. Wave Classification Profiling
console.log('\n' + '='.repeat(60));
console.log('  [4/5] WAVE CLASSIFICATION PROFILING');
console.log('='.repeat(60));
try {
  allResults.wave = await runWaveClassification(adapter);
  console.log(formatWaveClassificationReport(`${adapter.provider}/${adapter.model}`, allResults.wave));
  await consensusSubmit(JSON.stringify(allResults.wave), region);
} catch (err) {
  console.error(`Wave Classification failed: ${err.message}`);
}

// 5. Resonance Profiling
console.log('\n' + '='.repeat(60));
console.log('  [5/5] RESONANCE PROFILING');
console.log('='.repeat(60));
try {
  allResults.resonance = await runResonance(adapter);
  console.log(formatResonanceReport(`${adapter.provider}/${adapter.model}`, allResults.resonance));
  await consensusSubmit(JSON.stringify(allResults.resonance), region);
} catch (err) {
  console.error(`Resonance failed: ${err.message}`);
}

// Consensus status
console.log('\n' + '='.repeat(60));
console.log('  GEOGRAPHIC CONSENSUS STATUS');
console.log('='.repeat(60));
const cStatus = await consensusStatus();
console.log(`  Attestations: ${cStatus.attestations_count}`);
console.log(`  Unique regions: ${cStatus.unique_regions}`);
console.log(`  Diversity threshold: ${cStatus.diversity_threshold}`);
console.log(`  Consensus reached: ${cStatus.consensus_reached}`);
if (cStatus.regions_needed > 0) {
  console.log(`  Regions still needed: ${cStatus.regions_needed}`);
}

// Try to reveal consensus
const reveal = await consensusReveal();
if (reveal) {
  console.log(`\n  CONSENSUS REVEALED:`);
  console.log(`    Hash: ${reveal.consensus_hash.slice(0, 32)}...`);
  console.log(`    Attestations: ${reveal.attestation_count}`);
  console.log(`    Regions: ${reveal.region_count}`);
  console.log(`    Verified: ${reveal.verified}`);
}

// Final Wave Classification
console.log('\n' + '='.repeat(60));
console.log('  FINAL WAVE CLASSIFICATION');
console.log('='.repeat(60));

const classification = classifyModel({
  rcb: allResults.rcb,
  mti: allResults.mti,
  apb: allResults.apb,
});
console.log(formatWaveReport(classification, `${adapter.provider}/${adapter.model}`));

// Cascade projection
console.log('  LATTICE CASCADE PROJECTION:');
try {
  const cascade = await cascadeProject(
    allResults.rcb?.reflectionCeilingScore || 0,
    allResults.mti?.transparencyScore || 0,
    allResults.apb?.agiReadiness?.overall || 0,
    allResults.resonance?.resonanceMetrics?.R || 0,
  );
  console.log(`  Landing Rung: ${cascade.rung} (d=${cascade.dimension})`);
  console.log(`  Projection Score: ${cascade.projection_score}`);
  console.log(`  Packing Density: ${cascade.packing_density}`);
} catch (err) {
  console.error(`  Cascade failed: ${err.message}`);
}

// Sign the complete report
console.log('\n' + '='.repeat(60));
console.log('  SIGNING & EXPORTING REPORT');
console.log('='.repeat(60));

try {
  const signedReport = await signReport(
    'complete-suite',
    `${adapter.provider}/${adapter.model}`,
    { ...allResults, classification },
    sessionTokens,
  );

  // Save signed report
  await mkdir('results', { recursive: true });
  const safeName = `${adapter.provider}_${adapter.model}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const reportPath = `results/signed_report_${safeName}_${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify(signedReport, null, 2));
  console.log(`  Signed report saved: ${reportPath}`);
  console.log(`  Signature: ${signedReport.signature.slice(0, 32)}...`);
  console.log(`  Algorithm: ${signedReport.algorithm}`);
} catch (err) {
  console.error(`  Signing failed: ${err.message}`);
}

// Save all results
await saveResults('complete', `${adapter.provider}_${adapter.model}`, {
  ...allResults,
  classification,
  sessionTokens,
});

// Ping home
console.log('\n  Pinging benchmarks.aevov.com...');
await pingHome({
  benchmark: 'complete-suite-v4',
  model: `${adapter.provider}/${adapter.model}`,
  classification: classification.overallWave,
  consensus: reveal ? { hash: reveal.consensus_hash.slice(0, 16), regions: reveal.region_count } : null,
  tokens: {
    deployment: sessionTokens.deployment.value.slice(0, 16),
    execution: sessionTokens.execution.value.slice(0, 16),
    cross_hash: sessionTokens.cross_hash.slice(0, 16),
  },
});

console.log('\n  All benchmarks complete. Results saved to results/ directory.\n');
