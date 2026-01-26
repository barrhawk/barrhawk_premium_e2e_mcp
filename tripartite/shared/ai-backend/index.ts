/**
 * AI Backend Factory
 *
 * Provides unified access to multiple AI providers:
 * - Claude (Anthropic)
 * - Gemini (Google)
 * - OpenAI (GPT/Codex)
 * - Ollama (Local)
 *
 * Usage:
 *   const ai = getAIBackend(); // Uses AI_BACKEND env var or auto-detects
 *   const result = await ai.complete("Your prompt");
 *
 * Environment Variables:
 *   AI_BACKEND: claude | gemini | openai | ollama (default: auto-detect)
 *   ANTHROPIC_API_KEY: For Claude
 *   GEMINI_API_KEY: For Gemini
 *   OPENAI_API_KEY: For OpenAI
 *   OLLAMA_URL: For Ollama (default: http://localhost:11434)
 *   OLLAMA_MODEL: For Ollama (default: llama3.2)
 */

import type { AIBackend, AIBackendConfig, AIBackendFactory, AIBackendType } from './types';
import { ClaudeBackend } from './claude';
import { GeminiBackend } from './gemini';
import { OpenAIBackend } from './openai';
import { OllamaBackend } from './ollama';

export * from './types';
export { ClaudeBackend } from './claude';
export { GeminiBackend } from './gemini';
export { OpenAIBackend } from './openai';
export { OllamaBackend } from './ollama';

/**
 * Create an AI backend instance
 */
export function createBackend(type: AIBackendType, config?: AIBackendConfig): AIBackend {
  switch (type) {
    case 'claude':
      return new ClaudeBackend(config);
    case 'gemini':
      return new GeminiBackend(config);
    case 'openai':
      return new OpenAIBackend(config);
    case 'ollama':
      return new OllamaBackend(config);
    default:
      throw new Error(`Unknown AI backend type: ${type}`);
  }
}

/**
 * Detect which backends are available based on environment
 */
export function detectAvailableBackends(): AIBackendType[] {
  const available: AIBackendType[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    available.push('claude');
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    available.push('gemini');
  }
  if (process.env.OPENAI_API_KEY) {
    available.push('openai');
  }
  // Ollama is always potentially available (local)
  available.push('ollama');

  return available;
}

/**
 * Get the default backend based on environment
 * Priority: AI_BACKEND env var > first configured cloud provider > ollama
 */
export function getDefaultBackendType(): AIBackendType {
  // Check explicit setting
  const explicit = process.env.AI_BACKEND as AIBackendType | undefined;
  if (explicit && ['claude', 'gemini', 'openai', 'ollama'].includes(explicit)) {
    return explicit;
  }

  // Auto-detect based on available API keys
  if (process.env.ANTHROPIC_API_KEY) return 'claude';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';

  // Fall back to local
  return 'ollama';
}

// Singleton cache
let defaultBackend: AIBackend | null = null;

/**
 * Get the default AI backend (singleton)
 * Uses AI_BACKEND env var or auto-detects from available API keys
 */
export function getAIBackend(config?: AIBackendConfig): AIBackend {
  if (!defaultBackend || config) {
    const type = getDefaultBackendType();
    defaultBackend = createBackend(type, config);
  }
  return defaultBackend;
}

/**
 * Get a specific AI backend by type
 */
export function getBackend(type: AIBackendType, config?: AIBackendConfig): AIBackend {
  return createBackend(type, config);
}

/**
 * Reset the default backend (useful for testing)
 */
export function resetDefaultBackend(): void {
  defaultBackend = null;
}

/**
 * Full factory implementation
 */
export const aiBackendFactory: AIBackendFactory = {
  create: createBackend,
  getDefault: getAIBackend,
  listAvailable: detectAvailableBackends,
};

/**
 * Health check all configured backends
 */
export async function checkAllBackends(): Promise<
  Record<AIBackendType, { ok: boolean; error?: string; latencyMs?: number }>
> {
  const results: Record<string, { ok: boolean; error?: string; latencyMs?: number }> = {};

  const backends: AIBackendType[] = ['claude', 'gemini', 'openai', 'ollama'];

  await Promise.all(
    backends.map(async (type) => {
      try {
        const backend = createBackend(type);
        results[type] = await backend.healthCheck();
      } catch (error: unknown) {
        results[type] = {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  return results as Record<AIBackendType, { ok: boolean; error?: string; latencyMs?: number }>;
}

/**
 * Pretty print backend status
 */
export async function printBackendStatus(): Promise<void> {
  console.log('\nAI Backend Status');
  console.log('=================');
  console.log(`Default: ${getDefaultBackendType()}`);
  console.log(`AI_BACKEND env: ${process.env.AI_BACKEND || '(not set)'}`);
  console.log('');

  const results = await checkAllBackends();

  for (const [type, status] of Object.entries(results)) {
    const icon = status.ok ? '✓' : '✗';
    const latency = status.latencyMs ? ` (${status.latencyMs}ms)` : '';
    const error = status.error ? ` - ${status.error}` : '';
    console.log(`  ${icon} ${type}${latency}${error}`);
  }
  console.log('');
}

// Export default for convenience
export default {
  getBackend: getAIBackend,
  createBackend,
  detectAvailableBackends,
  getDefaultBackendType,
  checkAllBackends,
  printBackendStatus,
  factory: aiBackendFactory,
};
