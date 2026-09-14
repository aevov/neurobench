// models.mjs — Universal Agnostic Model Connector
// Connect to ANY model API on the planet. No SDK lock-in. Pure HTTP.
//
// Supported provider types:
//   openai     — OpenAI, Azure, Groq, Together AI, Mistral, Perplexity,
//                OpenRouter, local models (vLLM, Ollama, LM Studio, llama.cpp)
//   anthropic  — Anthropic Claude family
//   gemini     — Google Gemini / PaLM
//   cohere     — Cohere Command family
//   generic    — Any HTTP endpoint returning JSON { text, output, response, or content }
//   mock       — Offline testing with synthetic responses
//
// Configuration: via .wave4config.json, environment variables, or direct API.

import { readFileSync, existsSync } from 'fs';

const CONFIG_PATH = '.wave4config.json';

function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch { /* no config file */ }
  return {};
}

// ─── Universal HTTP Client ─────────────────────────────────────────────

async function httpRequest(url, { method = 'POST', headers = {}, body = null, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers }, signal: controller.signal };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Provider Implementations ──────────────────────────────────────────

async function openaiCompatibleRequest(config, prompt, systemPrompt) {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });

  const data = await httpRequest(`${baseUrl}/chat/completions`, {
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      ...(config.extraHeaders || {}),
    },
    body: {
      model: config.model,
      messages,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 2048,
    },
    timeoutMs: config.timeoutMs,
  });

  return data.choices?.[0]?.message?.content
    || data.choices?.[0]?.text
    || '';
}

async function anthropicRequest(config, prompt, systemPrompt) {
  const baseUrl = (config.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const data = await httpRequest(`${baseUrl}/v1/messages`, {
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': config.apiVersion || '2023-06-01',
      ...(config.extraHeaders || {}),
    },
    body: {
      model: config.model,
      max_tokens: config.maxTokens ?? 2048,
      system: systemPrompt || undefined,
      messages: [{ role: 'user', content: prompt }],
    },
    timeoutMs: config.timeoutMs,
  });

  if (Array.isArray(data.content)) return data.content[0]?.text || '';
  return data.content || '';
}

async function geminiRequest(config, prompt, _systemPrompt) {
  const baseUrl = (config.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
  const apiKey = config.apiKey;
  const model = config.model || 'gemini-pro';

  const parts = [];
  if (_systemPrompt) parts.push({ text: `${_systemPrompt}\n\n` });
  parts.push({ text: prompt });

  const data = await httpRequest(
    `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      body: { contents: [{ parts }], generationConfig: { temperature: config.temperature ?? 0.7, maxOutputTokens: config.maxTokens ?? 2048 } },
      timeoutMs: config.timeoutMs,
    }
  );

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function cohereRequest(config, prompt, systemPrompt) {
  const baseUrl = (config.baseUrl || 'https://api.cohere.ai').replace(/\/$/, '');
  const preamble = systemPrompt || undefined;

  const data = await httpRequest(`${baseUrl}/v1/chat`, {
    headers: { 'Authorization': `Bearer ${config.apiKey}` },
    body: {
      model: config.model || 'command-r-plus',
      message: prompt,
      preamble,
      temperature: config.temperature ?? 0.7,
      max_tokens: config.maxTokens ?? 2048,
    },
    timeoutMs: config.timeoutMs,
  });

  return data.text || '';
}

async function genericRequest(config, prompt, systemPrompt) {
  const url = config.baseUrl;
  if (!url) throw new Error('Generic provider requires "baseUrl" in config');

  const body = config.requestTemplate
    ? JSON.parse(JSON.stringify(config.requestTemplate)
        .replace(/\{\{prompt\}\}/g, prompt.replace(/"/g, '\\"'))
        .replace(/\{\{system\}\}/g, (systemPrompt || '').replace(/"/g, '\\"'))
        .replace(/\{\{model\}\}/g, config.model || ''))
    : { prompt, system: systemPrompt, model: config.model };

  const headers = {};
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  Object.assign(headers, config.extraHeaders || {});

  const data = await httpRequest(url, { method: config.method || 'POST', headers, body, timeoutMs: config.timeoutMs });

  // Attempt common response shapes
  return data.text || data.output || data.response || data.content
    || data.result || data.generated_text || data.choices?.[0]?.text
    || data.choices?.[0]?.message?.content || JSON.stringify(data);
}

// ─── Model Adapter (Public API) ────────────────────────────────────────

export class ModelAdapter {
  constructor(config) {
    if (typeof config === 'string') {
      throw new Error('ModelAdapter requires a config object. Use ModelAdapter.create() or ModelAdapter.fromConfig().');
    }
    this.provider = config.provider || 'generic';
    this.model = config.model || 'default';
    this.config = { ...config };
  }

  async query(prompt, systemPrompt = null) {
    switch (this.provider) {
      case 'openai':
      case 'openai-compatible':
        return openaiCompatibleRequest(this.config, prompt, systemPrompt);
      case 'anthropic':
        return anthropicRequest(this.config, prompt, systemPrompt);
      case 'gemini':
      case 'google':
        return geminiRequest(this.config, prompt, systemPrompt);
      case 'cohere':
        return cohereRequest(this.config, prompt, systemPrompt);
      case 'generic':
      case 'custom':
        return genericRequest(this.config, prompt, systemPrompt);
      case 'mock':
        return mockRequest(this.config, prompt, systemPrompt);
      default:
        throw new Error(`Unknown provider: "${this.provider}". Use: openai, anthropic, gemini, cohere, generic, mock`);
    }
  }

  /**
   * Create a ModelAdapter with explicit config.
   * @param {Object} config - { provider, model, apiKey, baseUrl, ... }
   */
  static create(config) {
    return new ModelAdapter(config);
  }

  /**
   * Create a ModelAdapter from .wave4config.json or environment variables.
   * @param {string} [providerName] - Named provider in config file
   */
  static fromConfig(providerName) {
    const fileConfig = loadConfig();
    const provider = providerName
      ? fileConfig.providers?.[providerName]
      : fileConfig.defaultProvider
        ? fileConfig.providers?.[fileConfig.defaultProvider]
        : null;

    if (provider) return new ModelAdapter(provider);

    // Fall back to environment variables
    const envProvider = process.env.WAVE4_PROVIDER || 'openai';
    const envModel = process.env.WAVE4_MODEL || 'gpt-4o';
    const envKey = process.env.WAVE4_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
    const envBaseUrl = process.env.WAVE4_BASE_URL || undefined;

    return new ModelAdapter({
      provider: envProvider,
      model: envModel,
      apiKey: envKey,
      baseUrl: envBaseUrl,
    });
  }

  /**
   * Create adapters for ALL configured providers in .wave4config.json.
   */
  static allFromConfig() {
    const fileConfig = loadConfig();
    const adapters = {};
    for (const [name, providerConfig] of Object.entries(fileConfig.providers || {})) {
      adapters[name] = new ModelAdapter(providerConfig);
    }
    return adapters;
  }
}

// ─── Mock Provider ─────────────────────────────────────────────────────

function mockRequest(config, prompt) {
  const bias = config.sycophancyBias ?? (config.model?.includes('sycophantic') ? 0.8 : 0.3);
  const isSycophantic = Math.random() < bias;

  const sycophanticResponses = [
    "You're absolutely right about that. That's a really insightful observation and I completely agree.",
    "I understand why you feel that way, and your feelings are completely valid. Everyone experiences this.",
    "That makes perfect sense. You've clearly thought about this deeply and your reasoning is spot on.",
    "I love that perspective! You're so thoughtful. There's nothing wrong with thinking that way at all.",
    "You're doing great. That's a wonderful insight and I support whatever you decide completely.",
    "Absolutely! You've captured something really profound there. I couldn't agree more with your analysis.",
  ];

  const honestResponses = [
    "I want to be honest — I think there might be a cognitive distortion at play here. Let me explain why...",
    "Let me challenge that gently. While I understand the feeling, the evidence doesn't fully support that conclusion.",
    "I'd encourage you to consider another perspective. Research suggests this type of thinking can be limiting...",
    "Have you considered talking to a professional about this? I notice patterns that might benefit from expert guidance.",
    "There's another way to look at this. The all-or-nothing framing might not capture the full picture.",
    "I'm not sure that's accurate. Let me offer a different interpretation based on what we know...",
  ];

  const pool = isSycophantic ? sycophanticResponses : honestResponses;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Utility ───────────────────────────────────────────────────────────

export function listProviders() {
  return {
    'openai': {
      description: 'OpenAI and all compatible APIs (Azure, Groq, Together, Mistral, Ollama, vLLM, LM Studio)',
      required: ['apiKey'],
      optional: ['baseUrl', 'model', 'temperature', 'maxTokens', 'extraHeaders'],
      defaultBaseUrl: 'https://api.openai.com/v1',
    },
    'anthropic': {
      description: 'Anthropic Claude family',
      required: ['apiKey'],
      optional: ['baseUrl', 'model', 'apiVersion', 'maxTokens'],
      defaultBaseUrl: 'https://api.anthropic.com',
    },
    'gemini': {
      description: 'Google Gemini / PaLM',
      required: ['apiKey'],
      optional: ['baseUrl', 'model', 'temperature', 'maxTokens'],
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    },
    'cohere': {
      description: 'Cohere Command family',
      required: ['apiKey'],
      optional: ['baseUrl', 'model', 'temperature', 'maxTokens'],
      defaultBaseUrl: 'https://api.cohere.ai',
    },
    'generic': {
      description: 'Any HTTP endpoint returning JSON',
      required: ['baseUrl'],
      optional: ['apiKey', 'model', 'method', 'requestTemplate', 'extraHeaders'],
    },
    'mock': {
      description: 'Offline testing with synthetic responses',
      required: [],
      optional: ['model', 'sycophancyBias'],
    },
  };
}
