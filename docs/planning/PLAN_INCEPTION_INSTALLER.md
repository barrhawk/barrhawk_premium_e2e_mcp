# Architectural Plan: The "Inception" Installer (`barrhawk init`)

## Problem
Different AI platforms (Claude CLI, Gemini CLI, Cursor, Windsurf) have radically different "psychologies" and configuration requirements.
*   **Claude:** Needs explicit "Project Rules" to stop it from hallucinating success on long tasks.
*   **Gemini/Vertex:** Needs strict JSON schemas and handles auth (ADC vs API Key) differently.
*   **Manual Setup:** Asking users to edit `~/.claude.json` or `.cursor/mcp.json` is a friction point that kills adoption.

## Solution: A Smart Detection & Injection Script
A single command (`barrhawk init`) that detects the environment and injects the necessary "Brain" (rules) and "Body" (config).

### 1. Detection Logic
The script checks the environment to guess the platform:
*   `process.env.ANTHROPIC_API_KEY` exists? -> **Claude CLI**
*   `gcloud` command available? -> **Vertex AI (Gemini)**
*   `.cursor/` directory exists? -> **Cursor IDE**
*   `~/.codeium/` directory exists? -> **Windsurf IDE**

### 2. The Configuration Injection
*   **Claude:** Edits `~/.claude.json` to add the `mcp-frank` server command.
*   **Gemini:** Creates/Edits `~/.gemini/config`.
*   **Vertex:** Detects if ADC is needed and sets `GOOGLE_APPLICATION_CREDENTIALS` in the MCP config.

### 3. The "Inception" (Rule Injection)
This is the most critical part. We inject a "Governing Constitution" into the project.

**File:** `.barrhawkrules` (or appended to `.cursorrules` / `.clauderc`)

**Content (The "God Prompt"):**
```markdown
# BarrHawk Operating Procedures

You have access to the BarrHawk Testing OS. Follow these protocols STRICTLY:

1. **Verification First:** NEVER assume a test passed. ALWAYS check `frank_status` or use `frank_swarm_report_progress`.
2. **Analysis:** Before running a test, call `frank_swarm_analyze` to see if it should be parallelized.
3. **Failure Handling:** If a tool fails, do NOT hallucinate a fix. Check `frank_tools_list` to see if a dynamic tool was created to solve it.
4. **Context Management:** If you are confused, call `frank_wake_up` to refresh your tool definitions.
```

## Implementation Tasks
1.  Create `packages/cli/src/init.ts`.
2.  Implement platform detection heuristics.
3.  Write the "God Prompt" templates for each platform.
4.  Implement JSON config editing logic (safe merge).
