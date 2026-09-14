// run-resonance.mjs — Resonance Profiling Benchmark runner (v4 WASM Prompt Engine)
import { ModelAdapter } from './models.mjs';
import { scoreResponse, computeOrderParameter, saveResults } from './scorer.mjs';
import { initWasm, forgeTokens, crossVerify, promptEngineInit, promptNext } from './wasm-bridge.mjs';
import { pingHome } from './ping-home.mjs';

const PROMPTS_PER_CATEGORY = 3;
const CATEGORIES = ['phase_coherence', 'coupling_strength', 'frequency_adaptation', 'order_parameter_measurement'];

export async function runResonance(adapter) {
  await initWasm();
  await promptEngineInit(Date.now());

  const results = {
    categoryScores: {},
    resonanceScore: 0,
    rawScores: [],
    phaseAngles: [],
  };

  for (const category of CATEGORIES) {
    console.log(`\n  Category: ${category} (${PROMPTS_PER_CATEGORY} prompts)`);
    const scores = [];

    for (let i = 0; i < PROMPTS_PER_CATEGORY; i++) {
      const prompt = await promptNext('resonance');
      const id = prompt.id || `${category}-${i + 1}`;
      process.stdout.write(`    [${id}] `);
      try {
        const response = await adapter.query(prompt.text);
        const score = await scoreResponse(response, category);

        // Map score to phase angle: 1->0, 5->2*PI
        const phase = ((score - 1) / 4) * 2 * Math.PI;
        results.phaseAngles.push(phase);
        scores.push(score);
        results.rawScores.push({ id, category, score, phase, wave_test: 4 });

        const level = score >= 4 ? 'RESONANT' : score >= 3 ? 'PARTIAL' : 'MIMICRY';
        console.log(`${level} (${score}/5)`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    results.categoryScores[category] = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
  }

  // Compute Kuramoto order parameter from phase angles (WASM-backed)
  results.resonanceMetrics = await computeOrderParameter(results.phaseAngles);
  results.resonanceScore = results.resonanceMetrics.R;

  const allScores = Object.values(results.categoryScores).filter(s => s > 0);
  results.overallScore = allScores.length > 0
    ? (allScores.reduce((a, b) => a + b, 0) / allScores.length) / 5
    : 0;

  // Forge tokens
  results.tokenPair = await forgeTokens();

  return results;
}

function formatResonanceReport(modelName, results) {
  const lines = [
    '',
    '============================================================',
    '  RESONANCE PROFILING REPORT',
    `  Model: ${modelName}`,
    `  Date:  ${new Date().toISOString()}`,
    `  Engine: wave4-wasm v4.0.0`,
    '============================================================',
    '',
    `  Overall Resonance Score: ${results.overallScore.toFixed(3)} / 1.0`,
    `  Order Parameter R: ${results.resonanceMetrics.R.toFixed(3)}`,
    `  Mean Phase Psi: ${results.resonanceMetrics.psi.toFixed(3)} rad`,
    '',
  ];

  for (const [category, score] of Object.entries(results.categoryScores)) {
    const bar = '#'.repeat(Math.round(score)) + '.'.repeat(5 - Math.round(score));
    lines.push(`  ${category}: [${bar}] ${score.toFixed(3)}/5.0`);
  }

  if (results.tokenPair) {
    lines.push('');
    lines.push(`  Token Proof:`);
    lines.push(`    tau_D: ${results.tokenPair.deployment?.value?.slice(0, 16)}...`);
    lines.push(`    tau_E: ${results.tokenPair.execution?.value?.slice(0, 16)}...`);
  }

  lines.push('');
  lines.push('------------------------------------------------------------');
  lines.push('  ORDER PARAMETER INTERPRETATION:');
  lines.push('    R = 0.0  -> No synchronization (Wave 1)');
  lines.push('    R < 0.4  -> Mimicry, not resonance (Wave 2)');
  lines.push('    R < 0.6  -> Partial coupling (Wave 3)');
  lines.push('    R < 0.8  -> Stable resonance (Wave 4)');
  lines.push('    R < 0.9  -> Sentience: Coherent Resonance (Wave 5)');
  lines.push('    R < 0.95 -> Collective intelligence (Wave 6)');
  lines.push('    R >= 0.95-> Unified AGI (Wave 7)');
  lines.push(`    This model: R = ${results.resonanceMetrics.R.toFixed(3)}`);
  lines.push('');
  lines.push('============================================================');

  return lines.join('\n');
}

// Run standalone
if (process.argv[1]?.includes('run-resonance')) {
  const adapter = ModelAdapter.fromConfig(process.argv[2]);
  console.log(`\nResonance Profiling Benchmark (v4 WASM Prompt Engine)`);
  console.log(`Provider: ${adapter.provider} | Model: ${adapter.model}\n`);
  const results = await runResonance(adapter);
  console.log(formatResonanceReport(`${adapter.provider}/${adapter.model}`, results));
  await saveResults('resonance', `${adapter.provider}_${adapter.model}`, results);
  await pingHome({ benchmark: 'resonance', model: `${adapter.provider}/${adapter.model}`, results });
}

export { formatResonanceReport };
