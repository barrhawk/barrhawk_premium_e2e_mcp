/**
 * AI Backend Abstraction Layer - Type Definitions
 *
 * Provides a unified interface for multiple AI providers:
 * - Anthropic (Claude)
 * - Google (Gemini)
 * - OpenAI (GPT/Codex)
 * - Local (Ollama)
 */

export type AIBackendType = 'claude' | 'gemini' | 'openai' | 'ollama';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature for randomness (0-1) */
  temperature?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** System prompt */
  systemPrompt?: string;
  /** Timeout in milliseconds */
  timeout?: number;
}

export interface AICompletionResult {
  /** Generated text content */
  content: string;
  /** Token usage statistics */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Model that generated the response */
  model: string;
  /** Whether the response was truncated */
  truncated: boolean;
  /** Stop reason */
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'error';
  /** Raw response for debugging */
  raw?: unknown;
}

export interface AIBackendConfig {
  /** API key for the provider */
  apiKey?: string;
  /** Base URL for API (for custom endpoints) */
  baseUrl?: string;
  /** Model to use */
  model?: string;
  /** Default options for all requests */
  defaultOptions?: AICompletionOptions;
}

export interface AIBackend {
  /** Backend type identifier */
  readonly type: AIBackendType;

  /** Backend display name */
  readonly name: string;

  /** Whether the backend is configured and ready */
  readonly isConfigured: boolean;

  /** Current model being used */
  readonly model: string;

  /**
   * Generate a completion from a single prompt
   */
  complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult>;

  /**
   * Generate a completion from a conversation
   */
  chat(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult>;

  /**
   * Check if the backend is available and configured
   */
  healthCheck(): Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
}

export interface AIBackendFactory {
  /**
   * Create an AI backend instance
   */
  create(type: AIBackendType, config?: AIBackendConfig): AIBackend;

  /**
   * Get the default backend based on environment
   */
  getDefault(): AIBackend;

  /**
   * List available backends
   */
  listAvailable(): AIBackendType[];
}
