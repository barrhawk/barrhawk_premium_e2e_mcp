/**
 * Golden Test Case Storage
 *
 * Manages reading/writing golden test cases from the file system.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  GoldenTestCase,
  GoldenSuite,
  SuitesConfig,
  AddOptions,
  ListOptions,
  SUITE_NAMES,
} from '../types.js';

// Get the golden directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GOLDEN_DIR = join(__dirname, '../../golden');

// In-memory cache
let suitesCache: SuitesConfig | null = null;
const casesCache = new Map<string, GoldenTestCase>();

/**
 * Ensure golden directory structure exists
 */
function ensureDirectories(): void {
  const dirs = [
    GOLDEN_DIR,
    join(GOLDEN_DIR, 'nl-authoring'),
    join(GOLDEN_DIR, 'ai-generation'),
    join(GOLDEN_DIR, 'rca'),
    join(GOLDEN_DIR, 'healing'),
    join(GOLDEN_DIR, 'a11y'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Create default suites.json if it doesn't exist
  const suitesPath = join(GOLDEN_DIR, 'suites.json');
  if (!existsSync(suitesPath)) {
    const defaultSuites: SuitesConfig = {
      suites: [
        {
          id: 'nl-authoring',
          name: 'NL Authoring',
          description: 'Natural language test authoring golden tests',
          cases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'ai-generation',
          name: 'AI Generation',
          description: 'AI-generated test quality validation',
          cases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'rca',
          name: 'Root Cause Analysis',
          description: 'RCA accuracy validation',
          cases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'healing',
          name: 'Self-Healing',
          description: 'Self-healing selector validation',
          cases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'a11y',
          name: 'Accessibility',
          description: 'Accessibility analysis validation',
          cases: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    writeFileSync(suitesPath, JSON.stringify(defaultSuites, null, 2));
  }
}

/**
 * Load suites configuration
 */
export function loadSuites(): SuitesConfig {
  if (suitesCache) return suitesCache;

  ensureDirectories();

  const suitesPath = join(GOLDEN_DIR, 'suites.json');
  const content = readFileSync(suitesPath, 'utf-8');
  suitesCache = JSON.parse(content);
  return suitesCache!;
}

/**
 * Save suites configuration
 */
export function saveSuites(config: SuitesConfig): void {
  ensureDirectories();

  const suitesPath = join(GOLDEN_DIR, 'suites.json');
  writeFileSync(suitesPath, JSON.stringify(config, null, 2));
  suitesCache = config;
}

/**
 * Get a specific suite
 */
export function getSuite(suiteId: string): GoldenSuite | undefined {
  const config = loadSuites();
  return config.suites.find(s => s.id === suiteId);
}

/**
 * Load a single test case
 */
export function loadCase(suiteId: string, caseId: string): GoldenTestCase | undefined {
  const cacheKey = `${suiteId}/${caseId}`;
  if (casesCache.has(cacheKey)) {
    return casesCache.get(cacheKey);
  }

  const casePath = join(GOLDEN_DIR, suiteId, `${caseId}.json`);
  if (!existsSync(casePath)) return undefined;

  const content = readFileSync(casePath, 'utf-8');
  const testCase = JSON.parse(content) as GoldenTestCase;
  casesCache.set(cacheKey, testCase);
  return testCase;
}

/**
 * Load all cases for a suite
 */
export function loadSuiteCases(suiteId: string): GoldenTestCase[] {
  ensureDirectories();

  const suiteDir = join(GOLDEN_DIR, suiteId);
  if (!existsSync(suiteDir)) return [];

  const files = readdirSync(suiteDir).filter(f => f.endsWith('.json'));
  const cases: GoldenTestCase[] = [];

  for (const file of files) {
    const caseId = file.replace('.json', '');
    const testCase = loadCase(suiteId, caseId);
    if (testCase) {
      cases.push(testCase);
    }
  }

  return cases;
}

/**
 * Load all cases (optionally filtered)
 */
export function loadAllCases(options?: ListOptions): GoldenTestCase[] {
  const config = loadSuites();
  let allCases: GoldenTestCase[] = [];

  const suitesToLoad = options?.suite
    ? [options.suite]
    : config.suites.map(s => s.id);

  for (const suiteId of suitesToLoad) {
    const cases = loadSuiteCases(suiteId);
    allCases = allCases.concat(cases);
  }

  // Filter by tags if specified
  if (options?.tags && options.tags.length > 0) {
    allCases = allCases.filter(c =>
      options.tags!.some(tag => c.tags.includes(tag))
    );
  }

  return allCases;
}

/**
 * Save a test case
 */
export function saveCase(testCase: GoldenTestCase): void {
  ensureDirectories();

  const casePath = join(GOLDEN_DIR, testCase.suite, `${testCase.id}.json`);
  writeFileSync(casePath, JSON.stringify(testCase, null, 2));

  // Update cache
  casesCache.set(`${testCase.suite}/${testCase.id}`, testCase);

  // Update suite's case list
  const config = loadSuites();
  const suite = config.suites.find(s => s.id === testCase.suite);
  if (suite && !suite.cases.includes(testCase.id)) {
    suite.cases.push(testCase.id);
    suite.updatedAt = new Date().toISOString();
    saveSuites(config);
  }
}

/**
 * Add a new golden test case
 */
export function addCase(options: AddOptions): GoldenTestCase {
  // Generate ID from name
  const id = options.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const testCase: GoldenTestCase = {
    id,
    name: options.name,
    description: options.description || options.name,
    suite: options.suite,
    input: options.input,
    expected: options.expected,
    matchMode: options.matchMode || 'semantic',
    threshold: options.threshold ?? 0.8,
    tags: options.tags || [],
    createdAt: new Date().toISOString(),
  };

  saveCase(testCase);
  return testCase;
}

/**
 * Delete a test case
 */
export function deleteCase(suiteId: string, caseId: string): boolean {
  const casePath = join(GOLDEN_DIR, suiteId, `${caseId}.json`);
  if (!existsSync(casePath)) return false;

  const { unlinkSync } = require('node:fs');
  unlinkSync(casePath);

  // Update cache
  casesCache.delete(`${suiteId}/${caseId}`);

  // Update suite's case list
  const config = loadSuites();
  const suite = config.suites.find(s => s.id === suiteId);
  if (suite) {
    suite.cases = suite.cases.filter(c => c !== caseId);
    suite.updatedAt = new Date().toISOString();
    saveSuites(config);
  }

  return true;
}

/**
 * Clear all caches
 */
export function clearCache(): void {
  suitesCache = null;
  casesCache.clear();
}

/**
 * Get statistics about golden test cases
 */
export function getStats(): {
  totalSuites: number;
  totalCases: number;
  casesBySuite: Record<string, number>;
} {
  const config = loadSuites();
  const casesBySuite: Record<string, number> = {};
  let totalCases = 0;

  for (const suite of config.suites) {
    const cases = loadSuiteCases(suite.id);
    casesBySuite[suite.id] = cases.length;
    totalCases += cases.length;
  }

  return {
    totalSuites: config.suites.length,
    totalCases,
    casesBySuite,
  };
}
