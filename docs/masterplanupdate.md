# BarrHawk Tripartite - Master Plan Update

## Current State (Broken)

| Component | Status | Issue |
|-----------|--------|-------|
| Bridge | ✅ Solid | None - 178K messages, 0 dropped |
| Doctor | 🟡 Partial | Dumb regex planner, no tool distribution |
| Igor | 🟡 Partial | Hardcoded 3 tools, no dynamic loading |
| Frank | 🔴 Broken | WebSocket flaky, never restarted |

---

## Fix 1: Frankenstein WebSocket Stability

### Problem
Frank keeps disconnecting every 2-3 seconds. Multiple instances fight for the same component ID.

### Root Cause
```
[bridge] Component frankenstein already registered on different connection, replacing
[bridge] Component unregistered due to kick: frankenstein
```
Old connections aren't fully cleaned up before new ones register.

### Solution

#### 1.1 Add Unique Instance ID
```typescript
// frankenstein/index.ts
const INSTANCE_ID = `frankenstein-${process.pid}-${Date.now()}`;

// Register with unique ID but same component type
bridge.register({
  componentId: 'frankenstein',
  instanceId: INSTANCE_ID,  // New field
  version: VERSION,
});
```

#### 1.2 Bridge: Handle Instance Replacement Gracefully
```typescript
// bridge/index.ts
// When same componentId registers with different instanceId:
// 1. Close old connection cleanly (send goodbye)
// 2. Wait for close confirmation (100ms timeout)
// 3. Then accept new registration
```

#### 1.3 Add Reconnection Backoff
```typescript
// frankenstein/index.ts
let reconnectAttempts = 0;
const MAX_BACKOFF = 30000;

function getReconnectDelay(): number {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_BACKOFF);
  reconnectAttempts++;
  return delay;
}

// On successful connect:
reconnectAttempts = 0;
```

#### 1.4 Single Instance Guard
```typescript
// frankenstein/index.ts
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';

const PID_FILE = '/tmp/frankenstein.pid';

function ensureSingleInstance(): void {
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, 'utf-8'));
    try {
      process.kill(oldPid, 0); // Check if running
      console.error(`Frankenstein already running (PID ${oldPid}). Exiting.`);
      process.exit(1);
    } catch {
      // Old process dead, continue
    }
  }
  writeFileSync(PID_FILE, process.pid.toString());
  process.on('exit', () => unlinkSync(PID_FILE));
}
```

### Verification
```bash
# Start Frank
bun run tripartite/frankenstein/index.ts &

# Check it stays connected for 60+ seconds
sleep 60 && curl -s localhost:7003/health | jq '.bridgeConnected'
# Should be: true

# Try starting second instance
bun run tripartite/frankenstein/index.ts
# Should exit with "already running" error
```

---

## Fix 2: Doctor as Tool Distributor

### Problem
Doctor tries to be a planner (badly, with regex). Should be a tool distributor.

### Current (Wrong)
```typescript
function generatePlan(intent: string): Plan {
  // Regex parsing... bad
  const urlMatch = intent.match(/navigate to (\S+)/i);
  // ...
}
```

### New Architecture

#### 2.1 Tool Registry in Doctor
```typescript
// doctor/index.ts

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
  category: 'browser' | 'os' | 'custom';
  contextCost: number;  // Estimated tokens this tool adds to context
}

const toolRegistry = new Map<string, ToolDefinition>();

// Load tools from Frank on startup
async function syncToolsFromFrank(): Promise<void> {
  const frankTools = await bridge.request('frankenstein', 'tool.list', {});
  for (const tool of frankTools) {
    toolRegistry.set(tool.name, {
      ...tool,
      contextCost: estimateContextCost(tool),
    });
  }
  logger.info(`Synced ${toolRegistry.size} tools from Frank`);
}
```

#### 2.2 Tool Subset Selection
```typescript
// doctor/index.ts

const MAX_IGOR_CONTEXT = 4000; // tokens

function selectToolsForTask(intent: string, url?: string): ToolDefinition[] {
  const selected: ToolDefinition[] = [];
  let contextUsed = 0;

  // Always include core browser tools
  const coreBrowser = ['browser.launch', 'browser.navigate', 'browser.click',
                       'browser.type', 'browser.screenshot', 'browser.close'];

  for (const name of coreBrowser) {
    const tool = toolRegistry.get(name);
    if (tool && contextUsed + tool.contextCost < MAX_IGOR_CONTEXT) {
      selected.push(tool);
      contextUsed += tool.contextCost;
    }
  }

  // Add relevant custom tools based on URL/intent
  for (const [name, tool] of toolRegistry) {
    if (tool.category === 'custom' && !selected.includes(tool)) {
      if (isToolRelevant(tool, intent, url) &&
          contextUsed + tool.contextCost < MAX_IGOR_CONTEXT) {
        selected.push(tool);
        contextUsed += tool.contextCost;
      }
    }
  }

  logger.info(`Selected ${selected.length} tools for Igor (${contextUsed} tokens)`);
  return selected;
}
```

#### 2.3 Send Tools to Igor with Plan
```typescript
// doctor/index.ts

async function dispatchToIgor(plan: Plan, tools: ToolDefinition[]): Promise<void> {
  bridge.sendTo('igor', 'plan.execute', {
    plan,
    tools,  // NEW: Include tool subset
    maxRetries: 2,
  });
}
```

#### 2.4 Remove Dumb Plan Generation
```typescript
// doctor/index.ts

// DELETE the generatePlan() regex function

// The calling AI (Claude Code) already provides structured intent
// Doctor just needs to:
// 1. Parse the intent for URL
// 2. Select relevant tools
// 3. Create a simple plan structure
// 4. Dispatch to Igor

function createExecutionPlan(intent: string, url?: string): Plan {
  return {
    id: generateId(),
    intent,
    url,
    steps: [
      { action: 'launch', params: { headless: true } },
      { action: 'navigate', params: { url } },
      // Let Igor figure out the rest with its tools
      { action: 'execute_intent', params: { intent } },  // NEW
      { action: 'screenshot', params: {} },
      { action: 'close', params: {} },
    ],
    createdAt: new Date(),
  };
}
```

### Verification
```bash
# Call frank_execute
# Check Doctor logs show tool selection
# Check Igor receives tool subset (not all tools)
```

---

## Fix 3: Igor Dynamic Tool Loading

### Problem
Igor has 3 hardcoded tools. Doesn't accept dynamic tools from Doctor.

### Current (Wrong)
```typescript
// igor/index.ts
const toolkit = {
  totalTools: 3,
  builtinTools: 3,
  igorifiedTools: 0,
};
```

### New Architecture

#### 3.1 Accept Tools from Doctor
```typescript
// igor/index.ts

let currentTools: Map<string, ToolDefinition> = new Map();

bridge.on('plan.execute', async (message: BridgeMessage) => {
  const { plan, tools } = message.payload as { plan: Plan; tools: ToolDefinition[] };

  // Load the tool subset for this execution
  currentTools.clear();
  for (const tool of tools) {
    currentTools.set(tool.name, tool);
  }

  logger.info(`Loaded ${currentTools.size} tools for plan ${plan.id}`);

  await executePlan(plan);
});
```

#### 3.2 Execute Intent Step (New)
```typescript
// igor/index.ts

async function executeStep(step: PlanStep): Promise<unknown> {
  switch (step.action) {
    // ... existing cases ...

    case 'execute_intent':
      // Use available tools to accomplish the intent
      return executeIntent(step.params.intent as string);
  }
}

async function executeIntent(intent: string): Promise<unknown> {
  // Parse intent and map to tool calls
  // This is where Igor uses its tool subset

  const actions = parseIntentToActions(intent);
  const results = [];

  for (const action of actions) {
    if (currentTools.has(action.tool)) {
      const result = await invokeTool(action.tool, action.params);
      results.push(result);
    } else {
      throw new Error(`Tool not available: ${action.tool}`);
    }
  }

  return results;
}
```

#### 3.3 Report Tool Usage Back
```typescript
// igor/index.ts

async function invokeTool(name: string, params: unknown): Promise<unknown> {
  const start = Date.now();

  try {
    const result = await sendToFrankenstein(name, params, 30000);

    // Report success to Doctor
    bridge.sendTo('doctor', 'tool.used', {
      tool: name,
      success: true,
      durationMs: Date.now() - start,
    });

    return result;
  } catch (err) {
    // Report failure to Doctor
    bridge.sendTo('doctor', 'tool.used', {
      tool: name,
      success: false,
      error: err.message,
      durationMs: Date.now() - start,
    });

    throw err;
  }
}
```

### Verification
```bash
# Run a task
# Check Igor logs show "Loaded X tools for plan"
# Check tool.used events sent to Doctor
```

---

## Fix 4: Doctor Creates Tools + Restarts Frank

### Problem
Doctor tracks failures but doesn't create tools or restart Frank.

### Current (Partial)
```typescript
// doctor/index.ts
// Has failure pattern tracking
// Has requestToolCreation() function
// But Frank never gets restarted
```

### New Architecture

#### 4.1 Tool Creation Request
```typescript
// doctor/index.ts

async function createToolForFailure(pattern: FailurePattern): Promise<void> {
  const toolSpec = generateToolSpec(pattern);

  logger.info(`Creating tool for failure pattern: ${pattern.errorPattern}`);

  // Request tool creation from Frank
  const result = await bridge.request('frankenstein', 'tool.create', {
    name: toolSpec.name,
    description: toolSpec.description,
    code: toolSpec.code,
  });

  if (result.success) {
    logger.info(`Tool created: ${toolSpec.name}`);

    // Mark pattern as having a tool
    pattern.toolCreated = true;
    pattern.toolName = toolSpec.name;

    // Restart Frank to load new tool
    await restartFrank();
  }
}

function generateToolSpec(pattern: FailurePattern): ToolSpec {
  // Generate a tool that solves this specific failure
  // Example: selector not found → try alternative selectors

  return {
    name: `fix_${pattern.action}_${Date.now()}`,
    description: `Auto-generated fix for: ${pattern.errorPattern}`,
    code: generateFixCode(pattern),
  };
}
```

#### 4.2 Frank Restart Mechanism
```typescript
// doctor/index.ts
import { spawn } from 'child_process';

const FRANK_PATH = path.join(__dirname, '../frankenstein/index.ts');
const BUN_PATH = process.env.BUN_PATH || 'bun';

async function restartFrank(): Promise<void> {
  logger.info('Restarting Frankenstein...');

  // Tell current Frank to shutdown gracefully
  bridge.sendTo('frankenstein', 'shutdown', { reason: 'tool-reload' });

  // Wait for disconnect
  await waitForFrankDisconnect(5000);

  // Start new Frank process
  const frank = spawn(BUN_PATH, ['run', FRANK_PATH], {
    detached: true,
    stdio: 'ignore',
  });

  frank.unref();

  // Wait for reconnect
  await waitForFrankConnect(10000);

  // Resync tools
  await syncToolsFromFrank();

  logger.info('Frankenstein restarted and tools synced');
}

async function waitForFrankDisconnect(timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const health = await bridge.getComponentHealth('frankenstein');
    if (!health.connected) return;
    await sleep(100);
  }
  logger.warn('Frank did not disconnect in time, continuing anyway');
}

async function waitForFrankConnect(timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const health = await bridge.getComponentHealth('frankenstein');
    if (health.connected) return;
    await sleep(100);
  }
  throw new Error('Frank did not reconnect after restart');
}
```

#### 4.3 Frank Shutdown Handler
```typescript
// frankenstein/index.ts

bridge.on('shutdown', (message: BridgeMessage) => {
  const { reason } = message.payload as { reason: string };
  logger.info(`Shutdown requested: ${reason}`);

  // Close browser if open
  if (browser) {
    browser.close().catch(() => {});
  }

  // Disconnect from bridge
  bridge.disconnect();

  // Exit process
  process.exit(0);
});
```

#### 4.4 Retry After Tool Creation
```typescript
// doctor/index.ts

async function handleStepFailure(planId: string, stepIndex: number, error: string): Promise<void> {
  const state = activePlans.get(planId);
  if (!state) return;

  const step = state.plan.steps[stepIndex];
  const pattern = getOrCreateFailurePattern(step, error);

  pattern.occurrences++;

  if (pattern.occurrences >= FAILURE_THRESHOLD && !pattern.toolCreated) {
    // Create tool and restart Frank
    await createToolForFailure(pattern);

    // Retry the plan with new tool available
    const tools = selectToolsForTask(state.plan.intent, state.plan.url);
    await dispatchToIgor(state.plan, tools);

    logger.info(`Retrying plan ${planId} with new tool: ${pattern.toolName}`);
  }
}
```

### Verification
```bash
# Trigger a failure 3 times (threshold)
# Check Doctor creates tool
# Check Frank restarts (new PID)
# Check retry succeeds with new tool
```

---

## Implementation Order

### Phase 1: Frank Stability (30 min)
1. Add PID file single-instance guard
2. Add reconnection backoff
3. Add shutdown handler
4. Test: Frank stays connected 60+ seconds

### Phase 2: Doctor Tool Registry (45 min)
1. Implement tool registry
2. Add syncToolsFromFrank()
3. Implement selectToolsForTask()
4. Remove generatePlan() regex garbage
5. Test: Doctor logs show tool selection

### Phase 3: Igor Dynamic Tools (30 min)
1. Accept tools from Doctor in plan.execute
2. Implement execute_intent step
3. Report tool usage back to Doctor
4. Test: Igor uses tool subset

### Phase 4: Tool Creation Flow (45 min)
1. Implement createToolForFailure()
2. Implement restartFrank()
3. Wire up failure → create → restart → retry
4. Test: End-to-end failure recovery

---

## Success Criteria

After all fixes:

```bash
# 1. Frank stays connected
curl localhost:7003/health | jq '.bridgeConnected'
# true (for 60+ seconds)

# 2. Doctor distributes tools
# Logs show: "Selected 8 tools for Igor (2400 tokens)"

# 3. Igor uses dynamic tools
# Logs show: "Loaded 8 tools for plan xyz"

# 4. Failure creates tool and restarts Frank
# frank_execute fails 3x on same pattern
# Doctor creates tool
# Frank restarts (new PID)
# Retry succeeds
```

## Files to Modify

| File | Changes |
|------|---------|
| `tripartite/frankenstein/index.ts` | PID guard, backoff, shutdown handler |
| `tripartite/doctor/index.ts` | Tool registry, selectTools, restartFrank |
| `tripartite/igor/index.ts` | Accept dynamic tools, execute_intent |
| `tripartite/bridge/index.ts` | Instance ID handling (minor) |
