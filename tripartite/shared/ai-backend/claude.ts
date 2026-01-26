/**
 * Anthropic Claude Backend Implementation
 */

import type {
  AIBackend,
  AIBackendConfig,
  AICompletionOptions,
  AICompletionResult,
  AIMessage,
} from './types';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_MAX_TOKENS = 4096;

export class ClaudeBackend implements AIBackend {
  readonly type = 'claude' as const;
  readonly name = 'Anthropic Claude';

  private apiKey: string | undefined;
  private baseUrl: string;
  readonly model: string;
  private defaultOptions: AICompletionOptions;

  constructor(config?: AIBackendConfig) {
    this.apiKey = config?.apiKey || process.env.ANTHROPIC_API_KEY;
    this.baseUrl = config?.baseUrl || 'https://api.anthropic.com';
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
      throw new Error('Claude backend not configured: ANTHROPIC_API_KEY not set');
    }

    const opts = { ...this.defaultOptions, ...options };
    const timeout = opts.timeout || 60000;

    // Separate system message from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
          temperature: opts.temperature,
          system: opts.systemPrompt || systemMessage?.content,
          messages: conversationMessages,
          stop_sequences: opts.stopSequences,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      return {
        content: data.content?.[0]?.text || '',
        usage: {
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        model: data.model || this.model,
        truncated: data.stop_reason === 'max_tokens',
        stopReason: this.mapStopReason(data.stop_reason),
        raw: data,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Claude API timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    if (!this.apiKey) {
      return { ok: false, error: 'ANTHROPIC_API_KEY not configured' };
    }

    const start = Date.now();
    try {
      // Simple completion to verify API access
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
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
