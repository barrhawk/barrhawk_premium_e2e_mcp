/**
 * SWARM COORDINATOR - Multi-Igor Parallel Test Execution
 *
 * Orchestrates multiple Igor subagents running in parallel.
 * Each Igor is a Claude CLI Task that uses frank_loop_* tools.
 *
 * Architecture:
 *   Claude CLI (Master)
 *       │
 *       ▼
 *   Swarm Coordinator (this)
 *       │
 *       ├──► Igor-1 (Task) ──► frank_loop_* ──► Frankenstein
 *       ├──► Igor-2 (Task) ──► frank_loop_* ──► Frankenstein
 *       └──► Igor-3 (Task) ──► frank_loop_* ──► Frankenstein
 *
 * When Igor fails, it escalates. Coordinator can:
 * 1. Ask Frankenstein to generate a new tool
 * 2. Retry with the new tool
 * 3. Reassign to another Igor
 */

import { createLogger } from '../shared/logger.js';

const logger = createLogger({
  component: 'swarm-coordinator',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface SwarmRoute {
  routeId: string;
  routeName: string;
  goal: string;
  successCriteria?: string[];
  priority: number;
  estimatedSteps: number;
  toolHints: string[];  // Tools likely needed
}

export interface SwarmConfig {
  maxIgors: number;
  timeoutMs: number;
  recordVideo: boolean;
  screenshotDir: string;
  onProgress?: (update: SwarmProgress) => void;
}

export interface SwarmProgress {
  swarmId: string;
  routeId: string;
  igorId: string;
  iteration: number;
  action: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed' | 'escalated';
  details?: string;
  screenshot?: string;
}

export interface SwarmSession {
  id: string;
  masterGoal: string;
  routes: SwarmRoute[];
  config: SwarmConfig;
  startTime: number;
  endTime?: number;
  status: 'planning' | 'running' | 'completed' | 'failed';
  results: Map<string, {
    routeId: string;
    igorId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    steps: number;
    error?: string;
    summary?: string;
  }>;
  videoPath?: string;
}

export interface IgorTaskConfig {
  igorId: string;
  routeId: string;
  routeName: string;
  swarmId: string;
  prompt: string;
  model: 'haiku' | 'sonnet' | 'opus';
  runInBackground: boolean;
}

// =============================================================================
// State
// =============================================================================

let currentSwarm: SwarmSession | null = null;

// =============================================================================
// Route Detection (Intelligent Goal Parsing)
// =============================================================================

const ROUTE_PATTERNS = [
  {
    keywords: ['login', 'sign in', 'auth', 'credentials'],
    name: 'Authentication',
    priority: 1,
    estimatedSteps: 5,
    toolHints: ['frank_loop_start', 'frank_loop_continue'],
  },
  {
    keywords: ['navigate', 'go to', 'open', 'visit', 'browse'],
    name: 'Navigation',
    priority: 2,
    estimatedSteps: 3,
    toolHints: ['frank_browser_navigate', 'frank_loop_continue'],
  },
  {
    keywords: ['sidepanel', 'sidebar', 'panel', 'extension'],
    name: 'Extension Interaction',
    priority: 3,
    estimatedSteps: 8,
    toolHints: ['frank_os_keyboard', 'frank_os_mouse', 'frank_loop_continue'],
  },
  {
    keywords: ['compare', 'plans', 'options', 'medicare', 'drug'],
    name: 'Plan Comparison',
    priority: 4,
    estimatedSteps: 15,
    toolHints: ['frank_loop_continue', 'frank_browser_click'],
  },
  {
    keywords: ['form', 'fill', 'input', 'enter', 'submit'],
    name: 'Form Filling',
    priority: 3,
    estimatedSteps: 10,
    toolHints: ['frank_browser_type', 'frank_loop_continue'],
  },
  {
    keywords: ['verify', 'check', 'assert', 'confirm', 'validate'],
    name: 'Verification',
    priority: 5,
    estimatedSteps: 5,
    toolHints: ['frank_loop_continue', 'frank_capture'],
  },
  {
    keywords: ['chat', 'message', 'ask', 'ai', 'assistant', 'conversation'],
    name: 'AI Interaction',
    priority: 4,
    estimatedSteps: 10,
    toolHints: ['frank_loop_continue', 'frank_browser_type'],
  },
];

/**
 * Parse a master goal into discrete routes
 */
export function parseGoalToRoutes(masterGoal: string): SwarmRoute[] {
  const goalLower = masterGoal.toLowerCase();
  const detectedRoutes: SwarmRoute[] = [];

  // Split goal into sub-goals if it contains conjunctions
  const subGoals = masterGoal
    .split(/(?:,|\band\b|\bthen\b|;|\bafter\b|\bfinally\b)/i)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (subGoals.length > 1) {
    // Multiple explicit sub-goals
    subGoals.forEach((subGoal, index) => {
      const matchedPattern = ROUTE_PATTERNS.find(p =>
        p.keywords.some(k => subGoal.toLowerCase().includes(k))
      );

      detectedRoutes.push({
        routeId: `route_${index + 1}`,
        routeName: matchedPattern?.name || `Step ${index + 1}`,
        goal: subGoal,
        priority: index + 1,
        estimatedSteps: matchedPattern?.estimatedSteps || 5,
        toolHints: matchedPattern?.toolHints || ['frank_loop_continue'],
      });
    });
  } else {
    // Single goal - detect implicit routes
    ROUTE_PATTERNS.forEach((pattern, index) => {
      if (pattern.keywords.some(k => goalLower.includes(k))) {
        detectedRoutes.push({
          routeId: `route_${pattern.name.toLowerCase().replace(/\s+/g, '_')}`,
          routeName: pattern.name,
          goal: `${pattern.name}: ${masterGoal}`,
          priority: pattern.priority,
          estimatedSteps: pattern.estimatedSteps,
          toolHints: pattern.toolHints,
        });
      }
    });

    // If no patterns matched, create a single route
    if (detectedRoutes.length === 0) {
      detectedRoutes.push({
        routeId: 'route_main',
        routeName: 'Main Flow',
        goal: masterGoal,
        priority: 1,
        estimatedSteps: 10,
        toolHints: ['frank_loop_start', 'frank_loop_continue'],
      });
    }
  }

  // Sort by priority
  return detectedRoutes.sort((a, b) => a.priority - b.priority);
}

// =============================================================================
// Igor Task Generation
// =============================================================================

/**
 * Generate a Claude CLI Task configuration for an Igor
 */
export function generateIgorTask(
  swarmId: string,
  route: SwarmRoute,
  config: SwarmConfig
): IgorTaskConfig {
  const igorId = `igor_${route.routeId}_${Date.now()}`;

  const prompt = `
# You are Igor - an E2E Testing Agent

## Your Mission
${route.goal}

## Swarm Context
- Swarm ID: ${swarmId}
- Route ID: ${route.routeId}
- Route Name: ${route.routeName}

## How to Execute

You have access to the intelligent loop tools. Use them like this:

1. **Start the loop:**
   \`\`\`
   frank_loop_start({ goal: "${route.goal}" })
   \`\`\`
   This returns a screenshot. LOOK AT IT.

2. **Analyze and act:**
   Look at the screenshot. Decide what to click/type. Then:
   \`\`\`
   frank_loop_continue({
     sessionId: "<from step 1>",
     action: {
       type: "click",  // or type, press_key, scroll, wait, focus_window
       params: { x: 500, y: 300 },
       reasoning: "Clicking the login button"
     }
   })
   \`\`\`

3. **Repeat** until goal achieved, then:
   \`\`\`
   frank_loop_continue({
     sessionId: "...",
     action: {
       type: "done",
       params: { success: true, message: "Completed ${route.routeName}" }
     }
   })
   \`\`\`

## Report Progress
Use frank_swarm_report_progress after each action:
\`\`\`
frank_swarm_report_progress({
  swarmId: "${swarmId}",
  routeId: "${route.routeId}",
  action: "Clicked login button",
  status: "completed"
})
\`\`\`

## If You Get Stuck
1. Try a different approach
2. Use frank_capture to get a fresh screenshot
3. If truly stuck, end with:
   \`\`\`
   frank_loop_continue({
     sessionId: "...",
     action: {
       type: "error",
       params: { message: "Stuck because: <reason>" }
     }
   })
   \`\`\`

## Success Criteria
${route.successCriteria?.map(c => `- ${c}`).join('\n') || '- Complete the goal described above'}

## Tool Hints
These tools are likely useful: ${route.toolHints.join(', ')}

GO! Start with frank_loop_start.
`.trim();

  return {
    igorId,
    routeId: route.routeId,
    routeName: route.routeName,
    swarmId,
    prompt,
    model: 'sonnet',  // Good balance of speed and capability
    runInBackground: true,
  };
}

// =============================================================================
// Swarm Orchestration
// =============================================================================

/**
 * Create a swarm execution plan
 */
export function createSwarm(
  masterGoal: string,
  config: Partial<SwarmConfig> = {}
): {
  swarmId: string;
  masterGoal: string;
  routes: SwarmRoute[];
  igorTasks: IgorTaskConfig[];
  config: SwarmConfig;
} {
  const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const fullConfig: SwarmConfig = {
    maxIgors: config.maxIgors || 4,
    timeoutMs: config.timeoutMs || 300000,
    recordVideo: config.recordVideo ?? true,
    screenshotDir: config.screenshotDir || '/tmp/swarm-screenshots',
    onProgress: config.onProgress,
  };

  // Parse goal into routes
  const allRoutes = parseGoalToRoutes(masterGoal);

  // Limit to maxIgors
  const routes = allRoutes.slice(0, fullConfig.maxIgors);

  // Generate Igor tasks
  const igorTasks = routes.map(route => generateIgorTask(swarmId, route, fullConfig));

  // Create session
  currentSwarm = {
    id: swarmId,
    masterGoal,
    routes,
    config: fullConfig,
    startTime: Date.now(),
    status: 'planning',
    results: new Map(),
  };

  // Initialize results
  routes.forEach((route, i) => {
    currentSwarm!.results.set(route.routeId, {
      routeId: route.routeId,
      igorId: igorTasks[i].igorId,
      status: 'pending',
      steps: 0,
    });
  });

  logger.info(`Swarm created: ${swarmId}`);
  logger.info(`Routes: ${routes.map(r => r.routeName).join(', ')}`);

  return {
    swarmId,
    masterGoal,
    routes,
    igorTasks,
    config: fullConfig,
  };
}

/**
 * Update swarm progress (called by Igors via MCP)
 */
export function updateSwarmProgress(progress: SwarmProgress): void {
  if (!currentSwarm || currentSwarm.id !== progress.swarmId) {
    logger.warn(`Unknown swarm: ${progress.swarmId}`);
    return;
  }

  const result = currentSwarm.results.get(progress.routeId);
  if (result) {
    if (progress.status === 'completed') {
      result.status = 'completed';
      result.summary = progress.details;
    } else if (progress.status === 'failed') {
      result.status = 'failed';
      result.error = progress.details;
    } else {
      result.status = 'running';
      result.steps++;
    }
  }

  // Call progress callback if configured
  if (currentSwarm.config.onProgress) {
    currentSwarm.config.onProgress(progress);
  }

  // Check if all routes are done
  const allDone = Array.from(currentSwarm.results.values())
    .every(r => r.status === 'completed' || r.status === 'failed');

  if (allDone) {
    currentSwarm.status = 'completed';
    currentSwarm.endTime = Date.now();
    logger.info(`Swarm completed: ${currentSwarm.id}`);
  }
}

/**
 * Get current swarm status
 */
export function getSwarmStatus(): SwarmSession | null {
  return currentSwarm;
}

/**
 * Stop current swarm
 */
export function stopSwarm(): SwarmSession | null {
  if (!currentSwarm) return null;

  currentSwarm.status = 'failed';
  currentSwarm.endTime = Date.now();

  const result = { ...currentSwarm };
  currentSwarm = null;
  return result;
}

// =============================================================================
// Golden Test - High Level Convenience Function
// =============================================================================

export interface GoldenTestResult {
  swarmId: string;
  masterGoal: string;
  routes: SwarmRoute[];
  igorTasks: IgorTaskConfig[];
  recordingInstructions: string;
  spawnInstructions: string;
}

/**
 * Create a "golden test" - a comprehensive E2E test with recording
 */
export function createGoldenTest(
  goal: string,
  options: {
    maxIgors?: number;
    recordVideo?: boolean;
  } = {}
): GoldenTestResult {
  const swarm = createSwarm(goal, {
    maxIgors: options.maxIgors || 3,
    recordVideo: options.recordVideo ?? true,
  });

  const recordingInstructions = swarm.config.recordVideo
    ? `
## Recording Instructions
1. FIRST: Start desktop recording:
   frank_desktop_record_start({ filename: "golden_test_${swarm.swarmId}" })

2. Run the test (spawn Igors below)

3. AFTER all Igors complete:
   frank_desktop_record_stop()

The video will capture everything that happens on screen.
`.trim()
    : 'Video recording disabled.';

  const spawnInstructions = `
## Spawn These Igors
Use Claude CLI's Task tool to spawn each Igor in parallel:

${swarm.igorTasks.map((task, i) => `
### Igor ${i + 1}: ${task.routeName}
\`\`\`
Task({
  subagent_type: "general-purpose",
  description: "Igor: ${task.routeName}",
  model: "${task.model}",
  run_in_background: true,
  prompt: <see below>
})
\`\`\`
`).join('\n')}

Each Igor will:
1. Start its own frank_loop
2. Analyze screenshots and take actions
3. Report progress via frank_swarm_report_progress
4. Complete or fail its route

You (Claude CLI master) should:
1. Start recording
2. Spawn all Igors in parallel (one Task call with multiple tools)
3. Monitor with frank_swarm_status
4. Stop recording when all complete
`.trim();

  return {
    swarmId: swarm.swarmId,
    masterGoal: swarm.masterGoal,
    routes: swarm.routes,
    igorTasks: swarm.igorTasks,
    recordingInstructions,
    spawnInstructions,
  };
}
