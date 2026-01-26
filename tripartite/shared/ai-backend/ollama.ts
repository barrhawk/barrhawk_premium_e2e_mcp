/**
 * Ollama Backend Implementation
 * For local model inference
 */

import type {
  AIBackend,
  AIBackendConfig,
  AICompletionOptions,
  AICompletionResult,
  AIMessage,
} from './types';

const DEFAULT_MODEL = 'llama3.2';
const DEFAULT_MAX_TOKENS = 4096;

export class OllamaBackend implements AIBackend {
  readonly type = 'ollama' as const;
  readonly name = 'Ollama (Local)';

  private baseUrl: string;
  readonly model: string;
  private defaultOptions: AICompletionOptions;
  private _isConfigured: boolean = false;

  constructor(config?: AIBackendConfig) {
    this.baseUrl = config?.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = config?.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
    this.defaultOptions = config?.defaultOptions || {};

    // Check if Ollama is available (async, sets flag)
    this.checkAvailability();
  }

  get isConfigured(): boolean {
    return this._isConfigured;
  }

  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      this._isConfigured = response.ok;
    } catch {
      this._isConfigured = false;
    }
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const timeout = opts.timeout || 120000; // Longer timeout for local inference

    // Convert messages to Ollama format
    const ollamaMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add system prompt if provided
    if (opts.systemPrompt && !messages.some((m) => m.role === 'system')) {
      ollamaMessages.unshift({ role: 'system', content: opts.systemPrompt });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: ollamaMessages,
          stream: false,
          options: {
            num_predict: opts.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: opts.temperature,
            stop: opts.stopSequences,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      return {
        content: data.message?.content || '',
        usage: {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model: data.model || this.model,
        truncated: data.done_reason === 'length',
        stopReason: this.mapStopReason(data.done_reason),
        raw: data,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Ollama API timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `Ollama not responding (${response.status})`,
          latencyMs: Date.now() - start,
        };
      }

      const data = await response.json();
      const hasModel = data.models?.some(
        (m: { name: string }) => m.name === this.model || m.name.startsWith(this.model)
      );

      if (!hasModel) {
        return {
          ok: false,
          error: `Model '${this.model}' not found. Run: ollama pull ${this.model}`,
          latencyMs: Date.now() - start,
        };
      }

      this._isConfigured = true;
      return { ok: true, latencyMs: Date.now() - start };
    } catch (error: unknown) {
      this._isConfigured = false;
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Ollama not available',
        latencyMs: Date.now() - start,
      };
    }
  }

  private mapStopReason(
    reason: string | undefined
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'error' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      default:
        return 'end_turn';
    }
  }
}
