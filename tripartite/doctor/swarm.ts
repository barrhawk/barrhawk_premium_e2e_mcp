/**
 * Doctor Swarm Mode
 *
 * Orchestrates multiple Igor subagents via Claude CLI Task tool.
 * Each Igor runs in its own context window with a curated tool bag.
 *
 * Features:
 * - Parallel route execution
 * - Dynamic tool bag per Igor
 * - Frank tool forge (Igors can request new tools)
 * - Result aggregation
 */

import { selectToolsForIntent, ToolDefinition, TOOL_REGISTRY, CATEGORY_INFO } from '../shared/tool-registry.js';
import { getExperienceManager } from '../shared/experience.js';
import { createLogger } from '../shared/logger.js';

const logger = createLogger({
  component: 'doctor-swarm',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface SwarmConfig {
  maxIgors: number;           // Max parallel Igors (default: 4)
  igorTimeout: number;        // Per-Igor timeout in ms (default: 120000)
  toolBagSize: number;        // Max tools per Igor (default: 15)
  sharedFrank: boolean;       // Share Frank pool or dedicated per Igor
  allowToolCreation: boolean; // Can Igors request new tools from Frank
}

export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  maxIgors: 4,
  igorTimeout: 120000,
  toolBagSize: 15,
  sharedFrank: true,
  allowToolCreation: true,
};

export interface RouteAssignment {
  routeId: string;
  routeName: string;
  intent: string;           // What this Igor should accomplish
  toolBag: ToolBagEntry[];  // Curated tools for this route
  priority: number;         // Execution priority (lower = first)
  dependencies?: string[];  // Route IDs that must complete first
}

export interface ToolBagEntry {
  name: string;
  description: string;
  inputSchema: object;
  category: string;
}

export interface SwarmPlan {
  id: string;
  masterIntent: string;
  routes: RouteAssignment[];
  config: SwarmConfig;
  createdAt: Date;
}

export interface IgorPrompt {
  routeId: string;
  systemPrompt: string;
  taskPrompt: string;
  toolBag: ToolBagEntry[];
  frankEndpoint: string;
}

// =============================================================================
// Route Detection
// =============================================================================

interface DetectedRoute {
  id: string;
  name: string;
  keywords: string[];
  suggestedCategories: string[];
}

const COMMON_ROUTES: DetectedRoute[] = [
  {
    id: 'auth',
    name: 'Authentication',
    keywords: ['login', 'signin', 'sign in', 'authenticate', 'credentials', 'password'],
    suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'assertions'],
  },
  {
    id: 'registration',
    name: 'Registration',
    keywords: ['signup', 'sign up', 'register', 'create account', 'new user'],
    suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'data_generation', 'assertions'],
  },
  {
    id: 'checkout',
    name: 'Checkout/Payment',
    keywords: ['checkout', 'payment', 'pay', 'cart', 'purchase', 'buy', 'order'],
    suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'browser_wait', 'assertions'],
  },
  {
    id: 'search',
    name: 'Search',
    keywords: ['search', 'find', 'query', 'filter', 'browse'],
    suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'browser_wait'],
  },
  {
    id: 'admin',
    name: 'Admin Panel',
    keywords: ['admin', 'dashboard', 'manage', 'settings', 'configuration'],
    suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'assertions', 'security'],
  },
  {
    id: 'profile',
    name: 'User Profile',
    keywords: ['profile', 'account', 'settings', 'preferences', 'user'],
    suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'assertions'],
  },
  {
    id: 'api',
    name: 'API Testing',
    keywords: ['api', 'endpoint', 'rest', 'graphql', 'backend'],
    suggestedCategories: ['backend_http', 'backend_test', 'assertions', 'data_generation'],
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    keywords: ['accessibility', 'a11y', 'wcag', 'screen reader', 'aria'],
    suggestedCategories: ['browser_core', 'browser_read', 'accessibility'],
  },
  {
    id: 'performance',
    name: 'Performance',
    keywords: ['performance', 'speed', 'load time', 'metrics', 'lighthouse'],
    suggestedCategories: ['browser_core', 'performance'],
  },
  {
    id: 'security',
    name: 'Security',
    keywords: ['security', 'xss', 'injection', 'vulnerability', 'owasp'],
    suggestedCategories: ['browser_core', 'security', 'data_generation'],
  },
];

/**
 * Detect routes from intent
 */
export function detectRoutes(intent: string): DetectedRoute[] {
  const intentLower = intent.toLowerCase();
  const detected: DetectedRoute[] = [];

  for (const route of COMMON_ROUTES) {
    const matchCount = route.keywords.filter(k => intentLower.includes(k)).length;
    if (matchCount > 0) {
      detected.push(route);
    }
  }

  // If no specific routes detected, create a generic one
  if (detected.length === 0) {
    detected.push({
      id: 'generic',
      name: 'General Testing',
      keywords: [],
      suggestedCategories: ['browser_core', 'browser_interact', 'browser_read', 'assertions'],
    });
  }

  return detected;
}

/**
 * Determine if swarm mode is needed
 */
export function shouldUseSwarm(intent: string): { useSwarm: boolean; reason: string; routeCount: number } {
  const routes = detectRoutes(intent);

  // Keywords that suggest parallel execution
  const parallelKeywords = ['full', 'complete', 'entire', 'all', 'comprehensive', 'end-to-end', 'e2e', 'parallel', 'multiple'];
  const hasParallelIntent = parallelKeywords.some(k => intent.toLowerCase().includes(k));

  if (routes.length >= 2 && hasParallelIntent) {
    return {
      useSwarm: true,
      reason: `Detected ${routes.length} routes (${routes.map(r => r.name).join(', ')}) with parallel intent`,
      routeCount: routes.length,
    };
  }

  if (routes.length >= 3) {
    return {
      useSwarm: true,
      reason: `Detected ${routes.length} distinct routes requiring parallel execution`,
      routeCount: routes.length,
    };
  }

  return {
    useSwarm: false,
    reason: routes.length === 1 ? 'Single route detected, swarm not needed' : 'Not enough routes for swarm',
    routeCount: routes.length,
  };
}

// =============================================================================
// Tool Bag Builder
// =============================================================================

/**
 * Build a tool bag for a specific route
 */
export function buildToolBag(route: DetectedRoute, maxTools: number = 15, url?: string): ToolBagEntry[] {
  const tools: ToolBagEntry[] = [];
  const addedNames = new Set<string>();
  const experience = getExperienceManager();

  // Check if we have site-specific knowledge
  const sitePattern = url ? experience.findSitePattern(url) : null;

  if (sitePattern) {
    logger.info(`Using site pattern: ${sitePattern.name}`, {
      knownSelectors: Object.keys(sitePattern.knownSelectors).length,
      commonFlows: sitePattern.commonFlows?.length || 0,
    });
  }

  // First, add tools from suggested categories (highest priority)
  for (const categoryId of route.suggestedCategories) {
    const categoryTools = TOOL_REGISTRY.filter(t => t.category === categoryId);
    for (const tool of categoryTools.sort((a, b) => b.weight - a.weight)) {
      if (tools.length >= maxTools) break;
      if (addedNames.has(tool.name)) continue;

      // Enhance tool description with site-specific hints if available
      let description = tool.description;
      if (sitePattern && sitePattern.knownSelectors) {
        const selectorHints = Object.entries(sitePattern.knownSelectors)
          .filter(([key]) => key.includes(tool.name.replace('browser_', '')))
          .map(([key, sel]) => `${key}: ${sel}`)
          .join(', ');
        if (selectorHints) {
          description += ` [Site hints: ${selectorHints}]`;
        }
      }

      tools.push({
        name: tool.name,
        description,
        inputSchema: tool.inputSchema,
        category: tool.category,
      });
      addedNames.add(tool.name);
    }
  }

  // Fill remaining slots with keyword-matched tools
  if (tools.length < maxTools) {
    const keywordSelection = selectToolsForIntent(route.keywords.join(' '), maxTools - tools.length);
    for (const tool of keywordSelection.tools) {
      if (addedNames.has(tool.name)) continue;
      tools.push({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        category: tool.category,
      });
      addedNames.add(tool.name);
    }
  }

  return tools;
}

// =============================================================================
// Swarm Plan Generator
// =============================================================================

/**
 * Generate a swarm execution plan
 */
export function generateSwarmPlan(
  intent: string,
  config: Partial<SwarmConfig> = {}
): SwarmPlan {
  const fullConfig = { ...DEFAULT_SWARM_CONFIG, ...config };
  const routes = detectRoutes(intent);

  // Limit to maxIgors
  const activeRoutes = routes.slice(0, fullConfig.maxIgors);

  const assignments: RouteAssignment[] = activeRoutes.map((route, index) => {
    const toolBag = buildToolBag(route, fullConfig.toolBagSize);

    return {
      routeId: route.id,
      routeName: route.name,
      intent: `${intent} - Focus on ${route.name} functionality`,
      toolBag,
      priority: index,
      dependencies: [], // Could be populated based on route relationships
    };
  });

  return {
    id: `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    masterIntent: intent,
    routes: assignments,
    config: fullConfig,
    createdAt: new Date(),
  };
}

// =============================================================================
// Igor Prompt Generator
// =============================================================================

/**
 * Generate the prompt for a Claude CLI Task that acts as Igor
 */
export function generateIgorPrompt(
  assignment: RouteAssignment,
  frankEndpoint: string = 'http://localhost:7003'
): IgorPrompt {
  const toolList = assignment.toolBag
    .map(t => `- ${t.name}: ${t.description}`)
    .join('\n');

  const systemPrompt = `You are IGOR, an intelligent test execution agent.

## Your Mission
${assignment.intent}

## Your Route
You are responsible for the "${assignment.routeName}" route (ID: ${assignment.routeId}).

## Your Tool Bag
You have access to ${assignment.toolBag.length} carefully selected tools:

${toolList}

## Execution Rules
1. Use ONLY the tools in your tool bag
2. If you need a tool that's not available, you can request Frank to create it
3. Take screenshots after important actions
4. Report any errors or unexpected behavior
5. Be thorough but efficient

## Frank Tool Forge
If you need a new tool, call frank_create_tool with:
- name: tool name (snake_case)
- description: what it does
- code: JavaScript code to execute

## Communication
- Report progress after each major step
- Report completion with results summary
- Report failures with error details`;

  const taskPrompt = `Execute the ${assignment.routeName} test flow.

Intent: ${assignment.intent}

Your tool bag has ${assignment.toolBag.length} tools. Use them to:
1. Navigate to the relevant pages
2. Interact with UI elements
3. Verify expected behavior
4. Take screenshots of important states
5. Report results

If you encounter something that needs a custom tool, ask Frank to create it.

Begin execution now.`;

  return {
    routeId: assignment.routeId,
    systemPrompt,
    taskPrompt,
    toolBag: assignment.toolBag,
    frankEndpoint,
  };
}

// =============================================================================
// Swarm Execution (Claude CLI Task Integration)
// =============================================================================

export interface SwarmTask {
  routeId: string;
  taskId?: string;        // Claude CLI Task ID once spawned
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
}

export interface SwarmExecution {
  planId: string;
  tasks: SwarmTask[];
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'partial' | 'failed';
}

/**
 * Generate Claude CLI Task tool calls for swarm execution
 *
 * This returns the structure that Claude CLI's Task tool expects.
 * The actual spawning is done by Claude CLI, not by this code.
 */
export function generateTaskCalls(plan: SwarmPlan): Array<{
  subagent_type: string;
  description: string;
  prompt: string;
  run_in_background: boolean;
  model?: string;
}> {
  return plan.routes.map(route => {
    const igorPrompt = generateIgorPrompt(route);

    return {
      subagent_type: 'general-purpose',
      description: `Igor: ${route.routeName}`,
      prompt: `${igorPrompt.systemPrompt}\n\n---\n\n${igorPrompt.taskPrompt}`,
      run_in_background: true,
      model: 'haiku', // Use faster model for parallel execution
    };
  });
}

// =============================================================================
// Exports for MCP
// =============================================================================

export {
  COMMON_ROUTES,
  detectRoutes as detectSwarmRoutes,
  shouldUseSwarm as analyzeSwarmNeed,
  generateSwarmPlan as createSwarmPlan,
  generateIgorPrompt as createIgorPrompt,
  generateTaskCalls as createTaskCalls,
};
