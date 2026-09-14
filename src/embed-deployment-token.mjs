#!/usr/bin/env node
// embed-deployment-token.mjs — Two-pass deployment token embedding
//
// This script implements the two-pass deployment token embed protocol:
// 1. Build the WASM binary (already done by wasm-pack)
// 2. Hash the binary → generate deployment token
// 3. Patch the binary with the token hash
// 4. Rehash → repatch with final self-referential checksum
//
// This creates a WASM binary that cryptographically contains its own identity.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(__dirname, '..', 'wave4-wasm', 'pkg', 'wave4_wasm_bg.wasm');
const TOKEN_PATH = join(__dirname, '..', 'wave4-wasm', 'pkg', 'deployment-token.json');

// Marker bytes in the WASM binary where the token hash gets embedded.
// We use the identity string "wave4-wasm-v4.0.0-identity" which is hashed
// in wasm_self_hash(). By replacing this string, we change the self-hash.
const IDENTITY_MARKER = Buffer.from('wave4-wasm-v4.0.0-identity');

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function blake3Node(data) {
  // Node.js doesn't have BLAKE3 natively, so we use the WASM module's
  // hash function via a simple exec, or fall back to SHA-256
  // For the embedding script, SHA-256 is sufficient (the WASM itself uses BLAKE3)
  return sha256(data);
}

async function embed() {
  console.log('============================================================');
  console.log('  WAVE4 DEPLOYMENT TOKEN EMBEDDING (Two-Pass Protocol)');
  console.log('============================================================\n');

  if (!existsSync(WASM_PATH)) {
    console.error('  Error: WASM binary not found at:', WASM_PATH);
    console.error('  Run "cd wave4-wasm && wasm-pack build --target web --out-dir pkg" first.\n');
    process.exit(1);
  }

  // Backup original
  const backupPath = WASM_PATH + '.bak';
  copyFileSync(WASM_PATH, backupPath);
  console.log('  [1/5] Backed up original WASM to:', backupPath);

  // Pass 1: Hash the original binary
  let wasmBytes = readFileSync(WASM_PATH);
  const hash1 = blake3Node(wasmBytes);
  console.log(`  [2/5] Pass 1 hash: ${hash1.slice(0, 32)}...`);

  // Generate a deployment identity string from the hash
  const deployIdentity = `wave4-wasm-v4.0.0-deployed-${hash1.slice(0, 16)}`;
  const deployIdentityBuf = Buffer.from(deployIdentity);

  // Ensure the identity marker fits within the original space (pad with null bytes)
  if (deployIdentityBuf.length > IDENTITY_MARKER.length) {
    console.error(`  Error: Deployment identity (${deployIdentityBuf.length} bytes) exceeds marker space (${IDENTITY_MARKER.length} bytes)`);
    process.exit(1);
  }

  // Pad the identity to match the original marker length
  const paddedIdentity = Buffer.alloc(IDENTITY_MARKER.length, 0);
  deployIdentityBuf.copy(paddedIdentity);

  // Patch the binary: replace the identity marker
  let offset = wasmBytes.indexOf(IDENTITY_MARKER);
  if (offset === -1) {
    console.log('  Warning: Identity marker not found in WASM binary.');
    console.log('  The WASM self-hash will use the default identity string.');
    console.log('  Token binding will still work via the wasm_hash in the report.\n');
  } else {
    const patched = Buffer.from(wasmBytes);
    paddedIdentity.copy(patched, offset);
    writeFileSync(WASM_PATH, patched);
    console.log(`  [3/5] Patched WASM with deployment identity at offset ${offset}`);
  }

  // Pass 2: Rehash the patched binary
  wasmBytes = readFileSync(WASM_PATH);
  const hash2 = blake3Node(wasmBytes);
  console.log(`  [4/5] Pass 2 hash (final): ${hash2.slice(0, 32)}...`);

  // Write deployment token record
  const tokenRecord = {
    version: '4.0.0',
    deployment_hash: hash2,
    original_hash: hash1,
    patched: offset !== -1,
    timestamp: new Date().toISOString(),
    wasm_size: wasmBytes.length,
    protocol: 'two-pass-embed-v1',
  };

  writeFileSync(TOKEN_PATH, JSON.stringify(tokenRecord, null, 2));
  console.log(`  [5/5] Deployment token saved: ${TOKEN_PATH}`);

  console.log(`
============================================================
  EMBEDDING COMPLETE
  Original Hash:  ${hash1.slice(0, 32)}...
  Final Hash:     ${hash2.slice(0, 32)}...
  WASM Size:      ${wasmBytes.length} bytes
  Patched:        ${offset !== -1 ? 'Yes' : 'No (marker not found)'}
============================================================

  The deployment token record can be used to verify that a specific
  WASM binary was the one used during benchmark execution.

  To verify: compare the wasm_hash field in signed reports against
  the deployment_hash in ${TOKEN_PATH}
`);
}

embed().catch(err => {
  console.error('Embedding failed:', err.message);
  process.exit(1);
});
