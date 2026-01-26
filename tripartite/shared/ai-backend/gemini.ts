/**
 * Google Gemini Backend Implementation
 */

import type {
  AIBackend,
  AIBackendConfig,
  AICompletionOptions,
  AICompletionResult,
  AIMessage,
} from './types';

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_MAX_TOKENS = 4096;

export class GeminiBackend implements AIBackend {
  readonly type = 'gemini' as const;
  readonly name = 'Google Gemini';

  private apiKey: string | undefined;
  private baseUrl: string;
  readonly model: string;
  private defaultOptions: AICompletionOptions;

  constructor(config?: AIBackendConfig) {
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    this.baseUrl =
      config?.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
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
      throw new Error('Gemini backend not configured: GEMINI_API_KEY not set');
    }

    const opts = { ...this.defaultOptions, ...options };
    const timeout = opts.timeout || 60000;

    // Convert messages to Gemini format
    const systemMessage = messages.find((m) => m.role === 'system');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemMessage
            ? { parts: [{ text: opts.systemPrompt || systemMessage.content }] }
            : opts.systemPrompt
              ? { parts: [{ text: opts.systemPrompt }] }
              : undefined,
          generationConfig: {
            maxOutputTokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: opts.temperature,
            stopSequences: opts.stopSequences,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${error}`);
      }

      const data = await response.json();

      // Extract content from Gemini response
      const candidate = data.candidates?.[0];
      const content = candidate?.content?.parts?.[0]?.text || '';
      const finishReason = candidate?.finishReason || 'STOP';

      // Gemini provides token counts in usageMetadata
      const usage = data.usageMetadata;

      return {
        content,
        usage: usage
          ? {
              inputTokens: usage.promptTokenCount || 0,
              outputTokens: usage.candidatesTokenCount || 0,
              totalTokens: usage.totalTokenCount || 0,
            }
          : undefined,
        model: this.model,
        truncated: finishReason === 'MAX_TOKENS',
        stopReason: this.mapStopReason(finishReason),
        raw: data,
      };
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Gemini API timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    if (!this.apiKey) {
      return { ok: false, error: 'GEMINI_API_KEY not configured' };
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
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'STOP_SEQUENCE':
        return 'stop_sequence';
      case 'SAFETY':
      case 'RECITATION':
      case 'OTHER':
        return 'error';
      default:
        return 'end_turn';
    }
  }
}
