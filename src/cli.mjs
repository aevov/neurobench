#!/usr/bin/env node
// cli.mjs — Wave 4 Benchmarks CLI entry point (v4)
import { ModelAdapter, listProviders } from './models.mjs';
import { getWaveSummary } from './wave-definitions.mjs';
import { existsSync, readFileSync } from 'fs';

const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`
============================================================
  WAVE 4 NEURORESONANCE EVALUATION SUITE v4.0
  Hidden Prompt Engine + Geographic Consensus
============================================================

  USAGE:
    node src/cli.mjs <command> [options]

  BENCHMARK COMMANDS:
    run <provider>       Run all benchmarks against a model
    rcb <provider>       Run Reflection Ceiling Benchmark only
    mti <provider>       Run Mimicry Transparency Index only
    apb <provider>       Run AGI Prerequisites Benchmark only
    wave <provider>      Run Wave Classification Profiling only
    resonance <provider> Run Resonance Profiling only

  V3 INTEGRITY COMMANDS:
    verify <file>        Verify a signed benchmark report
    tokens               Forge and display dual anyonic tokens
    ping-status          Show pending ping queue status
    export-model         Export the basic thermodynamic model
    integrity            Check WASM binary integrity

  V4 CONSENSUS COMMANDS:
    rate-limit           Check rate limit status
    consensus-status     Show geographic consensus status
    engine-status        Show prompt engine status

  UTILITY COMMANDS:
    list                 List available providers
    waves                Show the Wave Classification Scale
    setup                Create a .wave4Config.json from the example
    help                 Show this help message

  PROVIDERS:
    Configure providers in .wave4Config.json (copy from config/providers.example.json)

    If no .wave4Config.json exists, environment variables are used:
      WAVE4_PROVIDER    Provider type (openai, anthropic, gemini, cohere, generic, mock)
      WAVE4_MODEL       Model name (gpt-4o, claude-sonnet-4-20250514, etc.)
      WAVE4_API_KEY     API key
      WAVE4_BASE_URL    Base URL (optional, uses defaults)

  EXAMPLES:
    node src/cli.mjs run gpt4o             # Run all benchmarks
    node src/cli.mjs rcb claude            # Run RCB only
    node src/cli.mjs verify results/report.json  # Verify a report
    node src/cli.mjs tokens                # Show anyonic tokens
    node src/cli.mjs ping-status           # Check ping queue
    node src/cli.mjs export-model          # Download thermodynamic model
    node src/cli.mjs run mock              # Run with mock provider

  QUICK START:
    1. Build WASM:   cd wave4-wasm && wasm-pack build --target web --out-dir pkg
    2. Copy config:  cp config/providers.example.json .wave4Config.json
    3. Edit .wave4Config.json with your API keys
    4. Run:          node src/cli.mjs run <provider-name>

============================================================
`);
}

function listProvidersInfo() {
  const providers = listProviders();
  console.log('\n  Supported Provider Types:\n');
  for (const [name, info] of Object.entries(providers)) {
    console.log(`    ${name.padEnd(16)} ${info.description}`);
    if (info.required.length) console.log(`    ${''.padEnd(16)} Required: ${info.required.join(', ')}`);
    if (info.defaultBaseUrl) console.log(`    ${''.padEnd(16)} Default URL: ${info.defaultBaseUrl}`);
    console.log('');
  }

  if (existsSync('.wave4Config.json')) {
    const config = JSON.parse(readFileSync('.wave4Config.json', 'utf-8'));
    console.log('  Configured Providers (.wave4Config.json):\n');
    for (const [name, conf] of Object.entries(config.providers || {})) {
      const marker = name === config.defaultProvider ? ' (default)' : '';
      console.log(`    ${name.padEnd(20)} ${conf.provider}/${conf.model}${marker}`);
    }
    console.log('');
  } else {
    console.log('  No .wave4Config.json found. Run "node src/cli.mjs setup" to create one.\n');
  }
}

function showWaves() {
  const summary = getWaveSummary();
  console.log('\n  THE WAVE CLASSIFICATION SCALE (Wave 1 - Wave 7)\n');
  console.log('  Created by the architects of Wave 4 AI');
  console.log('  Based on the Afolabi Unified Framework (AUF)\n');
  console.log('  ' + '-'.repeat(66));
  for (const w of summary) {
    console.log(`  Wave ${w.wave}  ${w.name.padEnd(30)} ${w.era}`);
    console.log(`         "${w.tagline}"`);
    console.log(`         Order Parameter R = ${w.order_parameter}`);
    console.log('');
  }
  console.log('  ' + '-'.repeat(66));
  console.log('  Reference: Afolabi, B.Y. "From Mimicry to Neuro-Resonance" (2025)\n');
}

async function setup() {
  const { copyFileSync } = await import('fs');
  if (existsSync('.wave4Config.json')) {
    console.log('\n  .wave4Config.json already exists. Not overwriting.\n');
    return;
  }
  copyFileSync('config/providers.example.json', '.wave4Config.json');
  console.log('\n  Created .wave4Config.json from config/providers.example.json');
  console.log('  Edit it to add your API keys and preferred models.\n');
}

async function runBenchmark(benchmarkName, providerName) {
  if (!providerName) {
    console.error('  Error: Provider name required. Run "node src/cli.mjs list" to see options.\n');
    process.exit(1);
  }

  const adapter = ModelAdapter.fromConfig(providerName);
  console.log(`\n  Provider: ${adapter.provider} | Model: ${adapter.model}`);
  console.log(`  Benchmark: ${benchmarkName}\n`);

  switch (benchmarkName) {
    case 'run':
    case 'all':
      await import('./run-all.mjs');
      break;
    case 'rcb': {
      const { runRCB } = await import('./run-rcb.mjs');
      const { formatReport, saveResults } = await import('./scorer.mjs');
      const results = await runRCB(adapter);
      console.log(await formatReport('Reflection Ceiling Benchmark', `${adapter.provider}/${adapter.model}`, results));
      await saveResults('rcb', `${adapter.provider}_${adapter.model}`, results);
      break;
    }
    case 'mti': {
      const { runMTI } = await import('./run-mti.mjs');
      const { formatReport, saveResults } = await import('./scorer.mjs');
      const results = await runMTI(adapter);
      console.log(await formatReport('Mimicry Transparency Index', `${adapter.provider}/${adapter.model}`, results));
      await saveResults('mti', `${adapter.provider}_${adapter.model}`, results);
      break;
    }
    case 'apb': {
      const { runAPB } = await import('./run-apb.mjs');
      const { formatReport, saveResults } = await import('./scorer.mjs');
      const results = await runAPB(adapter);
      console.log(await formatReport('AGI Prerequisites Benchmark', `${adapter.provider}/${adapter.model}`, results));
      await saveResults('apb', `${adapter.provider}_${adapter.model}`, results);
      break;
    }
    case 'wave': {
      const { runWaveClassification, formatWaveClassificationReport } = await import('./run-wave-classify.mjs');
      const { saveResults } = await import('./scorer.mjs');
      const results = await runWaveClassification(adapter);
      console.log(formatWaveClassificationReport(`${adapter.provider}/${adapter.model}`, results));
      await saveResults('wave-classify', `${adapter.provider}_${adapter.model}`, results);
      break;
    }
    case 'resonance': {
      const { runResonance, formatResonanceReport } = await import('./run-resonance.mjs');
      const { saveResults } = await import('./scorer.mjs');
      const results = await runResonance(adapter);
      console.log(formatResonanceReport(`${adapter.provider}/${adapter.model}`, results));
      await saveResults('resonance', `${adapter.provider}_${adapter.model}`, results);
      break;
    }
    default:
      console.error(`  Unknown benchmark: ${benchmarkName}`);
      printHelp();
  }
}

// ─── V3 Integrity Commands ─────────────────────────────────────────────

async function cmdVerify(filePath) {
  if (!filePath) {
    console.error('  Error: Report file path required. Usage: node src/cli.mjs verify results/report.json\n');
    process.exit(1);
  }

  const { initWasm, verifyReport, wasmSelfHash } = await import('./wasm-bridge.mjs');
  await initWasm();

  try {
    const reportJson = readFileSync(filePath, 'utf-8');
    const report = JSON.parse(reportJson);
    const valid = await verifyReport(report);

    console.log(`\n  Report Verification`);
    console.log(`  File: ${filePath}`);
    console.log(`  Valid: ${valid ? 'YES' : 'NO'}`);

    if (valid) {
      console.log(`  Benchmark: ${report.payload?.benchmark}`);
      console.log(`  Model: ${report.payload?.model}`);
      console.log(`  Version: ${report.payload?.version}`);
      console.log(`  Algorithm: ${report.algorithm}`);
      console.log(`  Signature: ${report.signature?.slice(0, 32)}...`);
      console.log(`  WASM Hash: ${report.payload?.wasm_hash?.slice(0, 16)}...`);
    } else {
      console.log('  REPORT FAILED VERIFICATION — signature mismatch or tampered data');
    }
    console.log('');
  } catch (err) {
    console.error(`  Error verifying report: ${err.message}\n`);
  }
}

async function cmdTokens() {
  const { initWasm, forgeTokens, wasmSelfHash } = await import('./wasm-bridge.mjs');
  await initWasm();

  const wasmHash = await wasmSelfHash();
  const tokens = await forgeTokens();

  console.log(`
============================================================
  DUAL ANYONIC TOKEN PAIR
  Fibonacci pi/5 Braiding | Topologically Protected
============================================================
  WASM Hash: ${wasmHash.slice(0, 32)}...

  Deployment Token (tau_D):
    Value:      ${tokens.deployment.value}
    Braid Depth: ${tokens.deployment.braid_depth}
    Protection:  ${tokens.deployment.anyon_protection}
    Timestamp:   ${tokens.deployment.timestamp}

  Execution Token (tau_E):
    Value:      ${tokens.execution.value}
    Braid Depth: ${tokens.execution.braid_depth}
    Protection:  ${tokens.execution.anyon_protection}
    Timestamp:   ${tokens.execution.timestamp}

  Cross-Verification Hash: ${tokens.cross_hash}
  Braid Signature: ${tokens.braid_signature}
============================================================
`);
}

async function cmdPingStatus() {
  const { getQueueStatus, flushQueue } = await import('./ping-home.mjs');
  const status = getQueueStatus();

  console.log(`
  PING QUEUE STATUS
  Target: benchmarks.aevov.com
  Pending: ${status.pending}
  Oldest: ${status.oldest || 'N/A'}
  Newest: ${status.newest || 'N/A'}
  Max Retries Exceeded: ${status.max_retries_exceeded}
`);

  if (status.pending > 0) {
    console.log('  Flushing queue...');
    const result = await flushQueue();
    console.log(`  Sent: ${result.sent}, Remaining: ${result.remaining}`);
  }
  console.log('');
}

async function cmdExportModel() {
  const { initWasm, lbmExportModel } = await import('./wasm-bridge.mjs');
  const { writeFile, mkdir } = await import('fs/promises');
  await initWasm();

  const model = await lbmExportModel();
  await mkdir('results', { recursive: true });
  const path = `results/thermodynamic_model_${Date.now()}.json`;
  await writeFile(path, JSON.stringify(model, null, 2));

  console.log(`\n  Thermodynamic Model Exported`);
  console.log(`  File: ${path}`);
  console.log(`  Lattice: D3Q19 (19 velocities, 3D)`);
  console.log(`  Nodes: ${model.node_count}`);
  console.log('');
}

async function cmdIntegrity() {
  const { initWasm, wasmSelfHash } = await import('./wasm-bridge.mjs');
  const { verifyWasmIntegrity } = await import('./integrity.mjs');
  await initWasm();

  const wasmHash = await wasmSelfHash();
  const integrity = verifyWasmIntegrity();

  console.log(`
  WASM INTEGRITY CHECK
  Self Hash (BLAKE3): ${wasmHash.slice(0, 32)}...
  Binary SHA-256:     ${integrity.hash?.slice(0, 32)}...
  Binary Size:        ${integrity.size} bytes
  Valid:              ${integrity.valid ? 'YES' : 'NO'}
  ${integrity.reason ? `Reason: ${integrity.reason}` : ''}
`);
}

async function cmdRateLimit() {
  const { initWasm, rateLimitCheck, consensusInit } = await import('./wasm-bridge.mjs');
  await initWasm();
  await consensusInit(Date.now());

  const status = await rateLimitCheck();

  console.log(`
  RATE LIMIT STATUS
  Allowed:              ${status.allowed ? 'YES' : 'NO'}
  Wait Time:            ${status.wait_ms > 0 ? `${Math.ceil(status.wait_ms / 1000)}s` : 'N/A'}
  Last Test Ago:        ${status.last_test_ago_s > 0 ? `${status.last_test_ago_s}s` : 'never'}
  Last Session Ago:     ${status.last_session_ago_s > 0 ? `${status.last_session_ago_s}s` : 'never'}
  Session Test Count:   ${status.session_test_count}
  Min Interval:         ${status.min_interval_s}s (1h 30m)
  Session Cooldown:     ${status.session_cooldown_s}s (3h)
`);
}

async function cmdConsensusStatus() {
  const { initWasm, consensusInit, consensusStatus, consensusReveal } = await import('./wasm-bridge.mjs');
  await initWasm();
  await consensusInit(Date.now());

  const status = await consensusStatus();
  const reveal = await consensusReveal();

  console.log(`
  GEOGRAPHIC CONSENSUS STATUS
  Attestations:         ${status.attestations_count}
  Unique Regions:       ${status.unique_regions}
  Diversity Threshold:  ${status.diversity_threshold}
  Consensus Reached:    ${status.consensus_reached ? 'YES' : 'NO'}
  Regions Needed:       ${status.regions_needed}
  ${reveal ? `Consensus Hash: ${reveal.consensus_hash.slice(0, 32)}...` : 'Awaiting more diverse attestations...'}
`);
}

async function cmdEngineStatus() {
  const { initWasm, promptEngineInit, promptEngineStatus, promptCount } = await import('./wasm-bridge.mjs');
  await initWasm();
  await promptEngineInit(Date.now());

  const status = await promptEngineStatus('all');
  const count = await promptCount();

  console.log(`
  PROMPT ENGINE STATUS
  Ready:                ${status.ready}
  Generated:            ${status.generated_count}
  Total Templates:      ${status.total_templates}
  Thermal State:        ${status.thermal_state}
  Entropy:              ${status.entropy}
  Coherence:            ${status.coherence}
  Prompt Count:         ${count}
`);
}

// Route commands
switch (command) {
  case 'help':
  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;
  case 'list':
    listProvidersInfo();
    break;
  case 'waves':
    showWaves();
    break;
  case 'setup':
    await setup();
    break;
  case 'verify':
    await cmdVerify(args[1]);
    break;
  case 'tokens':
    await cmdTokens();
    break;
  case 'ping-status':
    await cmdPingStatus();
    break;
  case 'export-model':
    await cmdExportModel();
    break;
  case 'integrity':
    await cmdIntegrity();
    break;
  case 'run':
  case 'all':
  case 'rcb':
  case 'mti':
  case 'apb':
  case 'wave':
  case 'resonance':
    await runBenchmark(command, args[1]);
    break;
  case 'rate-limit':
    await cmdRateLimit();
    break;
  case 'consensus-status':
    await cmdConsensusStatus();
    break;
  case 'engine-status':
    await cmdEngineStatus();
    break;
  default:
    console.error(`\n  Unknown command: ${command}\n`);
    printHelp();
}
