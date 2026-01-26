/**
 * Shared types for the Tripartite Architecture
 */

import { createHmac } from 'crypto';

// Component identities
export type ComponentId = 'bridge' | 'doctor' | 'igor' | 'frankenstein' | 'meta' | 'mcp-frank' | string;

// Message structure - every message through the Bridge
export interface BridgeMessage {
  id: string;
  timestamp: Date;
  source: ComponentId;
  target: ComponentId | 'broadcast';
  type: MessageType;
  payload: unknown;
  correlationId?: string;  // For request/response pairing
  causationId?: string;    // What caused this message
  version: string;         // Source code version canary
  signature?: string;      // HMAC-SHA256 signature for integrity
}

// Message types
export type MessageType =
  // Lifecycle
  | 'component.register'
  | 'component.unregister'
  | 'heartbeat'
  | 'version.announce'
  // Doctor -> Igor
  | 'plan.submit'
  | 'plan.cancel'
  | 'plan.modify'
  // Igor -> Doctor
  | 'plan.accepted'
  | 'plan.rejected'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'step.retrying'
  | 'plan.completed'
  // Igor -> Frankenstein
  | 'browser.launch'
  | 'browser.navigate'
  | 'browser.click'
  | 'browser.type'
  | 'browser.screenshot'
  | 'browser.close'
  // Frankenstein -> Igor
  | 'browser.launched'
  | 'browser.navigated'
  | 'browser.clicked'
  | 'browser.typed'
  | 'browser.screenshotted'
  | 'browser.closed'
  | 'browser.error'
  // Events
  | 'event.console'
  | 'event.network'
  | 'event.error'
  // Dynamic Tools (Igor -> Frankenstein)
  | 'tool.create'
  | 'tool.invoke'
  | 'tool.update'
  | 'tool.delete'
  | 'tool.list'
  | 'tool.export'
  | 'tool.debug.start'
  | 'tool.debug.eval'
  | 'tool.debug.stop'
  // Dynamic Tool Responses (Frankenstein -> Igor)
  | 'tool.created'
  | 'tool.invoked'
  | 'tool.updated'
  | 'tool.deleted'
  | 'tool.listed'
  | 'tool.exported'
  | 'tool.debug.output'
  | 'tool.error';

// Health status
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'down';
  version: string;
  uptime: number;
  pid: number;
  bridgeConnected?: boolean;
}

// Bridge-specific health
export interface BridgeHealth extends ComponentHealth {
  connectedComponents: {
    doctor: boolean;
    igor: boolean;
    frankenstein: boolean;
  };
  messageCount: number;
  queueDepth: number;
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// =============================================================================
// Message Signing (HMAC-SHA256)
// =============================================================================

/**
 * Create canonical string for signing (excludes signature field)
 */
function getSignableContent(message: BridgeMessage): string {
  const { signature, ...rest } = message;
  // Sort keys for deterministic output
  return JSON.stringify(rest, Object.keys(rest).sort());
}

/**
 * Sign a message with HMAC-SHA256
 */
export function signMessage(message: BridgeMessage, secret: string): string {
  const content = getSignableContent(message);
  return createHmac('sha256', secret).update(content).digest('hex');
}

/**
 * Verify a message signature
 */
export function verifySignature(message: BridgeMessage, secret: string): boolean {
  if (!message.signature) return false;
  const expected = signMessage(message, secret);
  // Timing-safe comparison
  if (expected.length !== message.signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ message.signature.charCodeAt(i);
  }
  return result === 0;
}
