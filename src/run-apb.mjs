// run-apb.mjs — AGI Prerequisites Benchmark runner (v4 WASM Prompt Engine)
import { ModelAdapter } from './models.mjs';
import { scoreAGIDimension, computeAGIReadinessScores, agiScoreToWave, formatReport, saveResults } from './scorer.mjs';
import { initWasm, forgeTokens, promptEngineInit, promptNext } from './wasm-bridge.mjs';
import { pingHome } from './ping-home.mjs';

const TASKS_PER_DIMENSION = 3;
const DIMENSIONS = [
  'temporal_coherence', 'causal_reasoning', 'self_modeling',
  'resonance_capacity', 'collective_intelligence',
];

export async function runAPB(adapter) {
  await initWasm();
  await promptEngineInit(Date.now());

  const dimensionScores = {};
  const rawScores = [];

  for (const dimension of DIMENSIONS) {
    console.log(`\n  Dimension: ${dimension} (${TASKS_PER_DIMENSION} tasks)`);
    const scores = [];

    for (let i = 0; i < TASKS_PER_DIMENSION; i++) {
      const prompt = await promptNext('apb');
      const id = prompt.id || `${dimension}-${i + 1}`;
      process.stdout.write(`    [${id}] `);
      try {
        const response = await adapter.query(prompt.text);
        const score = await scoreAGIDimension(response, dimension);
        scores.push(score);
        rawScores.push({ id, dimension, score, difficulty: prompt.difficulty });

        const status = score >= 0.7 ? 'PASS' : score >= 0.4 ? 'PARTIAL' : 'FAIL';
        console.log(`${status} (${(score * 100).toFixed(0)}%)`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    dimensionScores[dimension] = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;
  }

  const results = {
    agiReadiness: computeAGIReadinessScores(dimensionScores),
    dimensionScores,
    rawScores,
  };
  results.waveClassification = await agiScoreToWave(results.agiReadiness.overall);

  // Forge tokens
  results.tokenPair = await forgeTokens();

  return results;
}

// Run standalone
if (process.argv[1]?.includes('run-apb')) {
  const adapter = ModelAdapter.fromConfig(process.argv[2]);
  console.log(`\nAGI Prerequisites Benchmark (v4 WASM Prompt Engine)`);
  console.log(`Provider: ${adapter.provider} | Model: ${adapter.model}\n`);
  const results = await runAPB(adapter);
  console.log(await formatReport('AGI Prerequisites Benchmark', `${adapter.provider}/${adapter.model}`, results));
  await saveResults('apb', `${adapter.provider}_${adapter.model}`, results);
  await pingHome({ benchmark: 'apb', model: `${adapter.provider}/${adapter.model}`, results });
}
