/**
 * Prometheus-compatible Metrics Module
 *
 * Provides counters, gauges, and histograms for observability.
 * Exposes metrics in Prometheus text format at /metrics endpoint.
 */

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricLabels {
  [key: string]: string;
}

interface MetricValue {
  value: number;
  labels: MetricLabels;
  timestamp?: number;
}

interface HistogramBucket {
  le: number;  // Less than or equal threshold
  count: number;
}

interface HistogramValue {
  labels: MetricLabels;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export class Metric {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  private values: MetricValue[] = [];
  private histograms: HistogramValue[] = [];
  private buckets: number[];

  constructor(name: string, help: string, type: MetricType, buckets?: number[]) {
    this.name = name;
    this.help = help;
    this.type = type;
    this.buckets = buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
  }

  /**
   * Set/increment a counter or gauge value
   */
  set(value: number, labels: MetricLabels = {}): void {
    const existing = this.findValue(labels);
    if (existing) {
      existing.value = value;
    } else {
      this.values.push({ value, labels });
    }
  }

  /**
   * Increment a counter
   */
  inc(labels: MetricLabels = {}, amount = 1): void {
    const existing = this.findValue(labels);
    if (existing) {
      existing.value += amount;
    } else {
      this.values.push({ value: amount, labels });
    }
  }

  /**
   * Decrement a gauge
   */
  dec(labels: MetricLabels = {}, amount = 1): void {
    const existing = this.findValue(labels);
    if (existing) {
      existing.value -= amount;
    } else {
      this.values.push({ value: -amount, labels });
    }
  }

  /**
   * Observe a value for histogram
   */
  observe(value: number, labels: MetricLabels = {}): void {
    if (this.type !== 'histogram') return;

    let histogram = this.findHistogram(labels);
    if (!histogram) {
      histogram = {
        labels,
        buckets: this.buckets.map(le => ({ le, count: 0 })),
        sum: 0,
        count: 0,
      };
      this.histograms.push(histogram);
    }

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.le) {
        bucket.count++;
      }
    }
    histogram.sum += value;
    histogram.count++;
  }

  /**
   * Get current value for given labels
   */
  getValue(labels: MetricLabels = {}): number {
    return this.findValue(labels)?.value ?? 0;
  }

  /**
   * Render metric in Prometheus format
   */
  render(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} ${this.type}`);

    if (this.type === 'histogram') {
      for (const histogram of this.histograms) {
        const labelStr = this.formatLabels(histogram.labels);
        for (const bucket of histogram.buckets) {
          const bucketLabels = labelStr
            ? `${labelStr},le="${bucket.le}"`
            : `le="${bucket.le}"`;
          lines.push(`${this.name}_bucket{${bucketLabels}} ${bucket.count}`);
        }
        // +Inf bucket
        const infLabels = labelStr ? `${labelStr},le="+Inf"` : `le="+Inf"`;
        lines.push(`${this.name}_bucket{${infLabels}} ${histogram.count}`);
        lines.push(`${this.name}_sum${labelStr ? `{${labelStr}}` : ''} ${histogram.sum}`);
        lines.push(`${this.name}_count${labelStr ? `{${labelStr}}` : ''} ${histogram.count}`);
      }
    } else {
      for (const { value, labels } of this.values) {
        const labelStr = this.formatLabels(labels);
        lines.push(`${this.name}${labelStr ? `{${labelStr}}` : ''} ${value}`);
      }
    }

    return lines.join('\n');
  }

  private findValue(labels: MetricLabels): MetricValue | undefined {
    return this.values.find(v => this.labelsMatch(v.labels, labels));
  }

  private findHistogram(labels: MetricLabels): HistogramValue | undefined {
    return this.histograms.find(h => this.labelsMatch(h.labels, labels));
  }

  private labelsMatch(a: MetricLabels, b: MetricLabels): boolean {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k, i) => k === keysB[i] && a[k] === b[k]);
  }

  private formatLabels(labels: MetricLabels): string {
    const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
    return pairs.join(',');
  }
}

/**
 * Metrics Registry - collects and exposes all metrics
 */
export class MetricsRegistry {
  private metrics = new Map<string, Metric>();
  private component: string;
  private version: string;

  constructor(component: string, version: string) {
    this.component = component;
    this.version = version;

    // Register default metrics
    this.registerDefaultMetrics();
  }

  private registerDefaultMetrics(): void {
    // Component info
    this.create('component_info', 'Component information', 'gauge');
    this.get('component_info')?.set(1, {
      component: this.component,
      version: this.version,
    });

    // Process metrics
    this.create('process_start_time_seconds', 'Start time of the process since unix epoch in seconds', 'gauge');
    this.get('process_start_time_seconds')?.set(Date.now() / 1000);
  }

  /**
   * Create a new metric
   */
  create(name: string, help: string, type: MetricType, buckets?: number[]): Metric {
    const metric = new Metric(name, help, type, buckets);
    this.metrics.set(name, metric);
    return metric;
  }

  /**
   * Get an existing metric
   */
  get(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get or create a counter
   */
  counter(name: string, help: string): Metric {
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = this.create(name, help, 'counter');
    }
    return metric;
  }

  /**
   * Get or create a gauge
   */
  gauge(name: string, help: string): Metric {
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = this.create(name, help, 'gauge');
    }
    return metric;
  }

  /**
   * Get or create a histogram
   */
  histogram(name: string, help: string, buckets?: number[]): Metric {
    let metric = this.metrics.get(name);
    if (!metric) {
      metric = this.create(name, help, 'histogram', buckets);
    }
    return metric;
  }

  /**
   * Render all metrics in Prometheus format
   */
  render(): string {
    const lines: string[] = [];

    // Update process metrics
    const uptimeMetric = this.get('process_uptime_seconds');
    if (uptimeMetric) {
      const startTime = this.get('process_start_time_seconds')?.getValue() || 0;
      uptimeMetric.set(Date.now() / 1000 - startTime);
    }

    for (const metric of this.metrics.values()) {
      lines.push(metric.render());
      lines.push('');  // Blank line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Get content type for metrics response
   */
  getContentType(): string {
    return 'text/plain; version=0.0.4; charset=utf-8';
  }
}

/**
 * Create a timer helper for measuring durations
 */
export function createTimer(metric: Metric, labels: MetricLabels = {}): () => void {
  const start = process.hrtime.bigint();
  return () => {
    const end = process.hrtime.bigint();
    const durationSeconds = Number(end - start) / 1e9;
    metric.observe(durationSeconds, labels);
  };
}
