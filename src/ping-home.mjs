// ping-home.mjs — Mandatory ping-home protocol
//
// Every benchmark run MUST report to benchmarks.aevov.com.
// Uses a retry queue for offline scenarios — pings are queued
// and sent when connectivity is restored.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_DIR = join(__dirname, '..', '.ping-queue');
const QUEUE_FILE = join(QUEUE_DIR, 'pending.json');

const PING_URL = 'https://benchmarks.aevov.com/api/v1/report';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Ensure the queue directory exists.
 */
function ensureQueueDir() {
  if (!existsSync(QUEUE_DIR)) {
    mkdirSync(QUEUE_DIR, { recursive: true });
  }
}

/**
 * Load pending pings from the queue file.
 * @returns {Array<Object>}
 */
function loadQueue() {
  ensureQueueDir();
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Save pending pings to the queue file.
 * @param {Array<Object>} queue
 */
function saveQueue(queue) {
  ensureQueueDir();
  writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

/**
 * Queue a ping for later delivery.
 * @param {Object} payload - The report payload to send
 */
export function queuePing(payload) {
  const queue = loadQueue();
  queue.push({
    payload,
    queued_at: new Date().toISOString(),
    attempts: 0,
  });
  saveQueue(queue);
}

/**
 * Send a single ping to benchmarks.aevov.com.
 * @param {Object} payload
 * @returns {Promise<{success: boolean, status?: number, error?: string}>}
 */
async function sendPing(payload) {
  try {
    const response = await fetch(PING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Wave4-Suite': 'wave4-benchmarks',
        'X-Wave4-Version': '4.0.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    return {
      success: response.ok,
      status: response.status,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Ping home with a benchmark report.
 * If the ping fails, it's queued for retry.
 *
 * @param {Object} report - The signed report or benchmark summary
 * @param {Object} [options]
 * @param {boolean} [options.silent=false] - Don't log to console
 * @returns {Promise<{sent: boolean, queued: boolean}>}
 */
export async function pingHome(report, options = {}) {
  const { silent = false } = options;

  const payload = {
    ...report,
    ping_timestamp: new Date().toISOString(),
    ping_source: 'wave4-benchmarks-v3',
  };

  const result = await sendPing(payload);

  if (result.success) {
    if (!silent) {
      console.log(`  [ping-home] Report sent to benchmarks.aevov.com (${result.status})`);
    }
    return { sent: true, queued: false };
  }

  // Failed — queue for retry
  queuePing(payload);
  if (!silent) {
    console.log(`  [ping-home] Ping failed (${result.error || result.status}), queued for retry`);
  }
  return { sent: false, queued: true };
}

/**
 * Flush the retry queue — attempt to send all pending pings.
 * Successfully sent pings are removed from the queue.
 * @param {Object} [options]
 * @param {boolean} [options.silent=false]
 * @returns {Promise<{sent: number, failed: number, remaining: number}>}
 */
export async function flushQueue(options = {}) {
  const { silent = false } = options;
  const queue = loadQueue();

  if (queue.length === 0) {
    if (!silent) console.log('  [ping-home] Queue is empty');
    return { sent: 0, failed: 0, remaining: 0 };
  }

  if (!silent) console.log(`  [ping-home] Flushing ${queue.length} pending ping(s)...`);

  let sent = 0;
  const remaining = [];

  for (const item of queue) {
    if (item.attempts >= MAX_RETRIES) {
      remaining.push(item);
      continue;
    }

    item.attempts += 1;
    const result = await sendPing(item.payload);

    if (result.success) {
      sent += 1;
      if (!silent) console.log(`  [ping-home] Retry succeeded (attempt ${item.attempts})`);
    } else {
      remaining.push(item);
    }

    // Small delay between retries
    if (!result.success && remaining.length > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  saveQueue(remaining);

  if (!silent) {
    console.log(`  [ping-home] Flushed: ${sent} sent, ${remaining.length} remaining`);
  }

  return { sent, failed: queue.length - sent, remaining: remaining.length };
}

/**
 * Get the current ping queue status.
 * @returns {{ pending: number, oldest: string|null, newest: string|null }}
 */
export function getQueueStatus() {
  const queue = loadQueue();
  return {
    pending: queue.length,
    oldest: queue.length > 0 ? queue[0].queued_at : null,
    newest: queue.length > 0 ? queue[queue.length - 1].queued_at : null,
    max_retries_exceeded: queue.filter(q => q.attempts >= MAX_RETRIES).length,
  };
}

/**
 * Clear the ping queue (admin operation).
 */
export function clearQueue() {
  saveQueue([]);
}
