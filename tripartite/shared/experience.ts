/**
 * EXPERIENCE SYSTEM
 *
 * Stores and retrieves learning data from past test runs.
 * Doctor uses this to generate better plans over time.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger({
  component: 'experience',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface SelectorExperience {
  selector: string;
  description: string;  // What we were trying to click/find
  url: string;          // URL pattern where this worked
  successes: number;
  failures: number;
  lastUsed: Date;
  alternatives?: string[];  // Other selectors that work for same element
}

export interface TimingExperience {
  action: string;        // e.g., 'navigate', 'click', 'type'
  urlPattern?: string;   // Optional URL pattern
  avgDuration: number;   // Average duration in ms
  maxDuration: number;   // Max observed duration
  samples: number;       // Number of samples
}

export interface SitePattern {
  urlPattern: string;    // Regex pattern for matching URLs
  name: string;          // Friendly name (e.g., 'Google', 'GitHub')
  knownSelectors: Record<string, string>;  // element name -> selector
  commonFlows: Array<{
    name: string;        // e.g., 'login', 'search'
    steps: Array<{ action: string; params: Record<string, unknown> }>;
  }>;
  notes?: string[];
}

export interface ErrorPattern {
  pattern: string;       // Error message pattern (regex)
  cause: string;         // What usually causes this
  fix: string;           // How to fix it
  occurrences: number;
  lastSeen: Date;
}

interface ExperienceData {
  selectors: {
    successes: SelectorExperience[];
    failures: SelectorExperience[];
  };
  timings: TimingExperience[];
  sites: SitePattern[];
  errors: ErrorPattern[];
  metadata: {
    lastUpdated: Date;
    totalPlans: number;
    successfulPlans: number;
  };
}

// =============================================================================
// Experience Manager
// =============================================================================

export class ExperienceManager {
  private data: ExperienceData;
  private readonly dataDir: string;
  private dirty = false;
  private saveInterval: ReturnType<typeof setInterval> | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.data = this.load();

    // Auto-save every 5 minutes if dirty
    this.saveInterval = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, 5 * 60 * 1000);
  }

  private load(): ExperienceData {
    const filePath = join(this.dataDir, 'experience.json');

    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        logger.info(`Loaded experience data: ${data.selectors?.successes?.length || 0} selectors, ${data.sites?.length || 0} sites`);
        return data;
      } catch (err) {
        logger.error('Failed to load experience data:', err);
      }
    }

    // Return empty experience
    return {
      selectors: { successes: [], failures: [] },
      timings: [],
      sites: [],
      errors: [],
      metadata: {
        lastUpdated: new Date(),
        totalPlans: 0,
        successfulPlans: 0,
      },
    };
  }

  save(): void {
    const filePath = join(this.dataDir, 'experience.json');

    try {
      mkdirSync(this.dataDir, { recursive: true });
      this.data.metadata.lastUpdated = new Date();
      writeFileSync(filePath, JSON.stringify(this.data, null, 2));
      this.dirty = false;
      logger.debug('Experience data saved');
    } catch (err) {
      logger.error('Failed to save experience data:', err);
    }
  }

  destroy(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    if (this.dirty) {
      this.save();
    }
  }

  // ===========================================================================
  // Selector Experience
  // ===========================================================================

  recordSelectorSuccess(selector: string, description: string, url: string): void {
    let existing = this.data.selectors.successes.find(
      s => s.selector === selector && s.url === url
    );

    if (existing) {
      existing.successes++;
      existing.lastUsed = new Date();
    } else {
      this.data.selectors.successes.push({
        selector,
        description,
        url,
        successes: 1,
        failures: 0,
        lastUsed: new Date(),
      });
    }

    this.dirty = true;
  }

  recordSelectorFailure(selector: string, description: string, url: string): void {
    // Add to failures
    let existing = this.data.selectors.failures.find(
      s => s.selector === selector && s.url === url
    );

    if (existing) {
      existing.failures++;
      existing.lastUsed = new Date();
    } else {
      this.data.selectors.failures.push({
        selector,
        description,
        url,
        successes: 0,
        failures: 1,
        lastUsed: new Date(),
      });
    }

    this.dirty = true;
  }

  findBestSelector(description: string, url: string): string | null {
    // Find selectors that worked for similar descriptions/URLs
    const candidates = this.data.selectors.successes.filter(s => {
      const urlMatches = url.includes(new URL(s.url).hostname);
      const descMatches = s.description.toLowerCase().includes(description.toLowerCase()) ||
                          description.toLowerCase().includes(s.description.toLowerCase());
      return urlMatches && descMatches;
    });

    if (candidates.length === 0) return null;

    // Sort by success rate and recency
    candidates.sort((a, b) => {
      const aRate = a.successes / (a.successes + a.failures);
      const bRate = b.successes / (b.successes + b.failures);
      if (aRate !== bRate) return bRate - aRate;
      return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
    });

    return candidates[0].selector;
  }

  isKnownBadSelector(selector: string, url: string): boolean {
    return this.data.selectors.failures.some(
      s => s.selector === selector &&
           url.includes(new URL(s.url).hostname) &&
           s.failures >= 3
    );
  }

  // ===========================================================================
  // Timing Experience
  // ===========================================================================

  recordTiming(action: string, duration: number, url?: string): void {
    const urlPattern = url ? new URL(url).hostname : undefined;

    let existing = this.data.timings.find(
      t => t.action === action && t.urlPattern === urlPattern
    );

    if (existing) {
      // Running average
      existing.avgDuration = (existing.avgDuration * existing.samples + duration) / (existing.samples + 1);
      existing.maxDuration = Math.max(existing.maxDuration, duration);
      existing.samples++;
    } else {
      this.data.timings.push({
        action,
        urlPattern,
        avgDuration: duration,
        maxDuration: duration,
        samples: 1,
      });
    }

    this.dirty = true;
  }

  getRecommendedTimeout(action: string, url?: string): number {
    const urlPattern = url ? new URL(url).hostname : undefined;

    // Look for exact match first
    let timing = this.data.timings.find(
      t => t.action === action && t.urlPattern === urlPattern
    );

    // Fall back to action-only
    if (!timing) {
      timing = this.data.timings.find(t => t.action === action && !t.urlPattern);
    }

    if (timing && timing.samples >= 3) {
      // Add 50% buffer to max observed
      return Math.ceil(timing.maxDuration * 1.5);
    }

    // Default timeouts by action
    const defaults: Record<string, number> = {
      navigate: 30000,
      click: 5000,
      type: 5000,
      screenshot: 10000,
      launch: 30000,
    };

    return defaults[action] || 30000;
  }

  // ===========================================================================
  // Site Patterns
  // ===========================================================================

  recordSitePattern(site: SitePattern): void {
    const existing = this.data.sites.findIndex(s => s.urlPattern === site.urlPattern);

    if (existing >= 0) {
      // Merge knowledge
      this.data.sites[existing] = {
        ...this.data.sites[existing],
        ...site,
        knownSelectors: {
          ...this.data.sites[existing].knownSelectors,
          ...site.knownSelectors,
        },
      };
    } else {
      this.data.sites.push(site);
    }

    this.dirty = true;
  }

  findSitePattern(url: string): SitePattern | null {
    for (const site of this.data.sites) {
      try {
        if (new RegExp(site.urlPattern).test(url)) {
          return site;
        }
      } catch {
        // Invalid regex, try string match
        if (url.includes(site.urlPattern)) {
          return site;
        }
      }
    }
    return null;
  }

  getSiteSelector(url: string, elementName: string): string | null {
    const site = this.findSitePattern(url);
    return site?.knownSelectors[elementName] || null;
  }

  // ===========================================================================
  // Error Patterns
  // ===========================================================================

  recordError(message: string, cause: string, fix: string): void {
    // Generalize error message into pattern
    const pattern = message
      .replace(/\d+/g, '\\d+')
      .replace(/['"][^'"]+['"]/g, '".*"')
      .replace(/[a-f0-9-]{36}/gi, '[a-f0-9-]{36}');

    let existing = this.data.errors.find(e => e.pattern === pattern);

    if (existing) {
      existing.occurrences++;
      existing.lastSeen = new Date();
    } else {
      this.data.errors.push({
        pattern,
        cause,
        fix,
        occurrences: 1,
        lastSeen: new Date(),
      });
    }

    this.dirty = true;
  }

  findErrorFix(message: string): { cause: string; fix: string } | null {
    for (const error of this.data.errors) {
      try {
        if (new RegExp(error.pattern).test(message)) {
          return { cause: error.cause, fix: error.fix };
        }
      } catch {
        // Invalid regex
      }
    }
    return null;
  }

  // ===========================================================================
  // Plan Stats
  // ===========================================================================

  recordPlanCompletion(success: boolean): void {
    this.data.metadata.totalPlans++;
    if (success) {
      this.data.metadata.successfulPlans++;
    }
    this.dirty = true;
  }

  getStats(): {
    totalPlans: number;
    successRate: number;
    knownSelectors: number;
    knownSites: number;
    knownErrors: number;
  } {
    return {
      totalPlans: this.data.metadata.totalPlans,
      successRate: this.data.metadata.totalPlans > 0
        ? this.data.metadata.successfulPlans / this.data.metadata.totalPlans
        : 0,
      knownSelectors: this.data.selectors.successes.length,
      knownSites: this.data.sites.length,
      knownErrors: this.data.errors.length,
    };
  }
}

// =============================================================================
// Singleton factory
// =============================================================================

let instance: ExperienceManager | null = null;

export function getExperienceManager(dataDir?: string): ExperienceManager {
  if (!instance) {
    const dir = dataDir || process.env.EXPERIENCE_DIR || '/home/raptor/federal/barrhawk_e2e_premium_mcp/experiencegained';
    instance = new ExperienceManager(dir);
  }
  return instance;
}
