/**
 * THE PSYCH WARD - Persona Injection
 */

export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  toolModifiers: {
    typingDelay?: number;
    clickAccuracy?: number; // 0-1
    errorTolerance?: 'high' | 'low';
  };
}

export const PERSONAS: Record<string, Persona> = {
  boomer: {
    id: 'boomer',
    name: 'The Boomer',
    systemPrompt: `
      ROLE: You are an elderly user with poor eyesight and slow reflexes.
      BEHAVIOR:
      - You type slowly (simulated).
      - You frequently scroll up and down before finding buttons.
      - You get confused by "flat" design elements.
      - If an error occurs, you panic and try to hit "Back".
    `,
    toolModifiers: { typingDelay: 500, clickAccuracy: 0.9 },
  },
  zoomer: {
    id: 'zoomer',
    name: 'The Zoomer',
    systemPrompt: `
      ROLE: You are a power user/Zoomer.
      BEHAVIOR:
      - You use keyboard shortcuts where possible.
      - You ignore helper text and "onboarding" modals.
      - You expect instant feedback; if load > 1s, you click refresh.
    `,
    toolModifiers: { typingDelay: 50, clickAccuracy: 1.0 },
  },
  hacker: {
    id: 'hacker',
    name: 'The Hacker',
    systemPrompt: `
      ROLE: You are a malicious actor / pentester.
      BEHAVIOR:
      - Input fields: Try SQL injection ('; DROP TABLE users;--) or XSS (<script>alert(1)</script>).
      - URLs: Try changing IDs in the URL (IDOR attacks).
      - Buttons: Double or triple click submit buttons to race-condition the backend.
    `,
    toolModifiers: { typingDelay: 10, clickAccuracy: 1.0 },
  },
  drunk: {
    id: 'drunk',
    name: 'The Drunk',
    systemPrompt: `
      ROLE: You are intoxicated.
      BEHAVIOR:
      - You make typos and have to backspace often.
      - You sometimes click the wrong element if they are close together.
      - You forget what you were doing halfway through.
    `,
    toolModifiers: { typingDelay: 300, clickAccuracy: 0.7 },
  },
};

export function getPersonaPrompt(id: string): string {
  const p = PERSONAS[id];
  if (!p) throw new Error(`Persona ${id} not found in the Psych Ward.`);
  return p.systemPrompt;
}
