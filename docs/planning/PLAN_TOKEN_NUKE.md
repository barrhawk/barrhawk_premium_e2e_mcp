# Architectural Plan: The "Token Nuke" (War Room Switch)

## Problem
MCP tools bloat the AI's context window. Adding 50-100 tools (even if useful) degrades the AI's reasoning capability ("IQ") and increases token costs significantly. Users need a way to "holster" their weapons when they are just planning or chatting, and "draw" them only when executing.

## Solution: The "Hollow Shell" Pattern
We do not kill the MCP server process. Instead, we make it "hollow" on demand.

### 1. The Trigger (Dashboard UI)
*   **UI:** A toggle switch in the War Room (Port 3333) labeled "Tools Active" / "Go Dark".
*   **Action:** When toggled OFF, the Dashboard sends a message to the Bridge:
    ```json
    {
      "type": "mcp.toggle_tools",
      "payload": { "enabled": false }
    }
    ```

### 2. The Mechanism (MCP Server Logic)
*   **Component:** `tripartite/mcp-frank.ts`
*   **State:** Maintains a local `toolsEnabled` boolean (default: `true`).
*   **Listener:** Subscribes to `mcp.toggle_tools` messages from the Bridge.
*   **Dynamic Update:**
    *   When `enabled` becomes `false`:
        1.  Triggers the MCP notification `notifications/tools/list_changed`.
        2.  Updates the `ListToolsRequestSchema` handler to return **only** a single, lightweight tool: `frank_wake_up`.
        3.  The Host AI (Claude/Gemini) re-fetches the tool list.
        4.  **Result:** Context usage drops from ~5000 tokens (120 tools) to ~50 tokens (1 tool).

### 3. The "Wake Up" (Restoration)
*   **Manual:** User toggles the switch back ON in the Dashboard.
*   **Agentic:** The AI itself calls `frank_wake_up`.
    *   Logic: This tool sets `toolsEnabled = true` and triggers `notifications/tools/list_changed`.
    *   Result: The full toolset reappears in the AI's context.

## Implementation Tasks
1.  **Modify `mcp-frank.ts`:**
    *   Add `toolsEnabled` state.
    *   Implement `getVisibleTools()` logic.
    *   Add `frank_wake_up` tool definition.
    *   Listen for Bridge messages to toggle state.
    *   Use `server.transport.send` to emit the `list_changed` notification.
2.  **Update Dashboard:** Add the toggle UI and websocket emit logic.
