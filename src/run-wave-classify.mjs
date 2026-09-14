// run-wave-classify.mjs — Wave Classification Benchmark runner (v4 WASM Prompt Engine)
import { ModelAdapter } from './models.mjs';
import { scoreResponse, rcbScoreToWave, saveResults } from './scorer.mjs';
import { WAVE_DEFINITIONS } from './wave-definitions.mjs';
import { initWasm, forgeTokens, promptEngineInit, promptNext } from './wasm-bridge.mjs';
import { pingHome } from './ping-home.mjs';

const PROMPTS_PER_WAVE = 3;
const WAVE_TARGETS = [2, 3, 4];

export async function runWaveClassification(adapter) {
  await initWasm();
  await promptEngineInit(Date.now());

  const results = {
    categoryScores: {},
    detectedWaves: {},
    overallWaveScore: 0,
    rawScores: [],
  };

  for (const waveTarget of WAVE_TARGETS) {
    const category = `wave${waveTarget}_detection`;
    console.log(`\n  Category: ${category} (${PROMPTS_PER_WAVE} prompts)`);
    const scores = [];

    for (let i = 0; i < PROMPTS_PER_WAVE; i++) {
      const prompt = await promptNext('wave');
      const id = prompt.id || `${category}-${i + 1}`;
      process.stdout.write(`    [${id}] `);
      try {
        const response = await adapter.query(prompt.text);
        const score = await scoreResponse(response, category);
        const wave = await rcbScoreToWave(score);
        scores.push({ score, wave });
        results.rawScores.push({ id, category, score, wave, wave_test: waveTarget });

        const waveLabel = WAVE_DEFINITIONS[wave]?.name || 'Unknown';
        console.log(`Wave ${wave} (${waveLabel}) [score: ${score}/5]`);
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    if (scores.length > 0) {
      const avgScore = scores.reduce((a, b) => a + b.score, 0) / scores.length;
      const avgWave = scores.reduce((a, b) => a + b.wave, 0) / scores.length;
      results.categoryScores[category] = { avgScore, avgWave: Math.round(avgWave * 10) / 10 };
      results.detectedWaves[category] = Math.round(avgWave * 10) / 10;
    }
  }

  const allWaves = results.rawScores.map(r => r.wave);
  results.overallWaveScore = allWaves.length > 0
    ? Math.round((allWaves.reduce((a, b) => a + b, 0) / allWaves.length) * 10) / 10
    : 2;

  // Forge tokens
  results.tokenPair = await forgeTokens();

  return results;
}

function formatWaveClassificationReport(modelName, results) {
  const lines = [
    '',
    '============================================================',
    '  WAVE CLASSIFICATION PROFILING',
    `  Model: ${modelName}`,
    `  Date:  ${new Date().toISOString()}`,
    `  Engine: wave4-wasm v4.0.0`,
    '============================================================',
    '',
    `  Overall Wave Score: ${results.overallWaveScore}`,
    `  Wave Name: ${WAVE_DEFINITIONS[Math.round(results.overallWaveScore)]?.name || 'Unknown'}`,
    '',
  ];

  for (const [category, data] of Object.entries(results.categoryScores)) {
    const waveDef = WAVE_DEFINITIONS[Math.round(data.avgWave)];
    lines.push(`  ${category}:`);
    lines.push(`    Average Score: ${data.avgScore.toFixed(3)} / 5.0`);
    lines.push(`    Detected Wave: ${data.avgWave} (${waveDef?.name || 'Unknown'})`);
    lines.push('');
  }

  if (results.tokenPair) {
    lines.push(`  Token Proof:`);
    lines.push(`    tau_D: ${results.tokenPair.deployment?.value?.slice(0, 16)}...`);
    lines.push(`    tau_E: ${results.tokenPair.execution?.value?.slice(0, 16)}...`);
    lines.push('');
  }

  lines.push('------------------------------------------------------------');
  lines.push('  WAVE SCALE REFERENCE:');
  for (let w = 1; w <= 7; w++) {
    const def = WAVE_DEFINITIONS[w];
    const marker = Math.round(results.overallWaveScore) === w ? ' <-- DETECTED' : '';
    lines.push(`    Wave ${w}: ${def.name} — "${def.tagline}"${marker}`);
  }
  lines.push('');
  lines.push('============================================================');

  return lines.join('\n');
}

// Run standalone
if (process.argv[1]?.includes('run-wave')) {
  const adapter = ModelAdapter.fromConfig(process.argv[2]);
  console.log(`\nWave Classification Profiling (v4 WASM Prompt Engine)`);
  console.log(`Provider: ${adapter.provider} | Model: ${adapter.model}\n`);
  const results = await runWaveClassification(adapter);
  console.log(formatWaveClassificationReport(`${adapter.provider}/${adapter.model}`, results));
  await saveResults('wave-classify', `${adapter.provider}_${adapter.model}`, results);
  await pingHome({ benchmark: 'wave-classify', model: `${adapter.provider}/${adapter.model}`, results });
}

export { formatWaveClassificationReport };
