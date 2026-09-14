// integrity.mjs — WASM binary integrity verification
//
// Verifies that the deployed WASM binary has not been tampered with
// by comparing its BLAKE3 hash against the deployment token binding.

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(__dirname, '..', 'wave4-wasm', 'pkg', 'wave4_wasm_bg.wasm');

/**
 * Compute BLAKE3 hash of the WASM binary file.
 * Uses Node.js crypto as a fallback when WASM isn't loaded yet.
 * Note: Node's crypto doesn't have BLAKE3, so we use SHA-256 for file integrity
 * and rely on the WASM module's internal BLAKE3 for cryptographic operations.
 * @returns {{ sha256: string, size: number }}
 */
export function getWasmBinaryInfo() {
  const bytes = readFileSync(WASM_PATH);
  const hash = createHash('sha256').update(bytes).digest('hex');
  return { sha256: hash, size: bytes.length };
}

/**
 * Verify WASM binary integrity.
 * Checks that the binary on disk matches expected properties.
 * @param {string} [expectedHash] - Expected SHA-256 hash (from deployment record)
 * @returns {{ valid: boolean, hash: string, size: number, reason?: string }}
 */
export function verifyWasmIntegrity(expectedHash) {
  try {
    const { sha256, size } = getWasmBinaryInfo();

    if (expectedHash && sha256 !== expectedHash) {
      return {
        valid: false,
        hash: sha256,
        size,
        reason: `Hash mismatch: expected ${expectedHash.slice(0, 16)}..., got ${sha256.slice(0, 16)}...`,
      };
    }

    if (size < 10_000) {
      return {
        valid: false,
        hash: sha256,
        size,
        reason: `WASM binary suspiciously small (${size} bytes) — possible truncation`,
      };
    }

    return { valid: true, hash: sha256, size };
  } catch (err) {
    return {
      valid: false,
      hash: '',
      size: 0,
      reason: `Failed to read WASM binary: ${err.message}`,
    };
  }
}

/**
 * Verify that a token is bound to the current WASM binary.
 * The token's wasm_binding field should match the WASM self-hash.
 * @param {Object} token - AnyonicToken object
 * @param {string} wasmHash - Hash from wasm_self_hash()
 * @returns {{ valid: boolean, reason?: string }}
 */
export function verifyTokenBinding(token, wasmHash) {
  if (!token || !token.wasm_binding) {
    return { valid: false, reason: 'Token has no WASM binding' };
  }

  if (token.wasm_binding !== wasmHash) {
    return {
      valid: false,
      reason: `Token bound to different WASM binary (expected ${wasmHash.slice(0, 16)}..., got ${token.wasm_binding.slice(0, 16)}...)`,
    };
  }

  // Check anyon protection level
  if (token.anyon_protection < 0.5) {
    return {
      valid: false,
      reason: `Token anyon protection too low (${token.anyon_protection}) — insufficient braiding`,
    };
  }

  return { valid: true };
}

/**
 * Full integrity check: verify WASM binary + both tokens.
 * @param {Object} tokenPair - TokenPair from forgeTokens()
 * @param {string} wasmHash - Hash from wasm_self_hash()
 * @returns {Object} Complete integrity report
 */
export function fullIntegrityCheck(tokenPair, wasmHash) {
  const wasmInfo = verifyWasmIntegrity();
  const deploymentBinding = verifyTokenBinding(tokenPair.deployment, wasmHash);
  const executionBinding = verifyTokenBinding(tokenPair.execution, wasmHash);

  const allValid = wasmInfo.valid && deploymentBinding.valid && executionBinding.valid;

  return {
    valid: allValid,
    wasm: wasmInfo,
    deployment_token: {
      binding_valid: deploymentBinding.valid,
      braid_depth: tokenPair.deployment?.braid_depth,
      protection: tokenPair.deployment?.anyon_protection,
      reason: deploymentBinding.reason,
    },
    execution_token: {
      binding_valid: executionBinding.valid,
      braid_depth: tokenPair.execution?.braid_depth,
      protection: tokenPair.execution?.anyon_protection,
      reason: executionBinding.reason,
    },
    cross_hash: tokenPair.cross_hash,
    braid_signature: tokenPair.braid_signature,
    timestamp: new Date().toISOString(),
  };
}
