/**
 * OpenAI Backend Implementation
 * Supports GPT models and Codex
 */

import type {
  AIBackend,
  AIBackendConfig,
  AICompletionOptions,
  AICompletionResult,
  AIMessage,
} from './types';

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4096;

export class OpenAIBackend implements AIBackend {
  readonly type = 'openai' as const;
  readonly name = 'OpenAI';

  private apiKey: string | undefined;
  private baseUrl: string;
  readonly model: string;
  private defaultOptions: AICompletionOptions;

  constructor(config?: AIBackendConfig) {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    this.baseUrl = config?.baseUrl || 'https://api.openai.com/v1';
    this.model = config?.model || DEFAULT_MODEL;
    this.defaultOptions = config?.defaultOptions || {};
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI backend not configured: OPENAI_API_KEY not set');
    }

    const opts = { ...this.defaultOptions, ...options };
    const timeout = opts.timeout || 60000;

    // Convert messages to OpenAI format
    const openaiMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Add system prompt if provided and not already in messages
    if (opts.systemPrompt && !messages.some((m) => m.role === 'system')) {
      openaiMessages.unshift({ role: 'system', content: opts.systemPrompt });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: openaiMessages,
          max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
          temperature: opts.temperature,
          stop: opts.stopSequences,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      const choice = data.choices?.[0];
      const content = choice?.message?.content || '';
      const finishReason = choice?.finish_reason || 'stop';

      return {
        content,
        usage: data.usage
          ? {
              inputTokens: data.usage.prompt_tokens || 0,
              outputTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            }
          : undefined,
        model: data.model || this.model,
        truncated: finishReason === 'length',
        stopReason: this.mapStopReason(finishReason),
        raw: data,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI API timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    if (!this.apiKey) {
      return { ok: false, error: 'OPENAI_API_KEY not configured' };
    }

    const start = Date.now();
    try {
      await this.complete('Say "ok"', { maxTokens: 10, timeout: 10000 });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (error: unknown) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        latencyMs: Date.now() - start,
      };
    }
  }

  private mapStopReason(
    reason: string
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' | 'error' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'content_filter':
        return 'error';
      default:
        return 'end_turn';
    }
  }
}
