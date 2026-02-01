# Architectural Plan: The SaaS "Power Proxy" ($200 Tier)

## Problem
You have a "Max Plan" (Enterprise/Team) with high rate limits and concurrency. You want to resell this power to users (Tier 3 - $200/mo) without giving them your actual API key (security risk).

## Solution: Igor as a Client (The Proxy Model)
We decouple the *Planning* (Local) from the *Intelligence* (Cloud).

### 1. Architecture
*   **Tier 1 (Free):** User runs Igor locally. Igor uses `process.env.ANTHROPIC_API_KEY` (User's key).
*   **Tier 3 (Enterprise):** User runs Igor locally, but it is configured to use the **BarrHawk Proxy**.

### 2. The Proxy Server (Your Cloud)
*   **Endpoint:** `https://api.barrhawk.com/v1/generate`
*   **Auth:** Validates the User's License Key (Tier 3).
*   **Action:** Forwards the prompt to Anthropic/Google using **YOUR Enterprise Key**.
*   **Return:** Streams the response back to the user's local Igor.

### 3. Igor Logic Update (`igor/index.ts`)
Modify the AI Backend factory (`tripartite/shared/ai-backend/index.ts`) to support a "Remote" backend type.

```typescript
// Pseudo-code logic
const backendType = process.env.BARRHAWK_TIER === 'enterprise' ? 'remote' : 'local';

if (backendType === 'remote') {
  // Use Remote Backend
  return new RemoteBackend({
    endpoint: 'https://api.barrhawk.com/v1/generate',
    licenseKey: process.env.BARRHAWK_LICENSE_KEY
  });
} else {
  // Use Local Backend (Claude/Gemini/Ollama)
  return createLocalBackend();
}
```

### 4. Value Proposition
*   **Security:** Your key never leaves your server.
*   **Power:** Users get "Lightning Strike" capability without needing their own paid Anthropic account.
*   **Control:** You can enforce quotas, usage limits, and specialized system prompts at the proxy level.

## Implementation Tasks
1.  **Update `ai-backend`:** Create `RemoteBackend` class implementing the `AIBackend` interface.
2.  **Build Proxy Server:** Simple Hono/Express server to forward requests.
3.  **Update Igor:** Add config logic to switch between local/remote based on env vars.
