#!/usr/bin/env npx tsx
import { getFlakyDetector } from '../packages/premium/flaky-detector.js';
import path from 'path';

async function main() {
  // Assume running from package root
  const detector = await getFlakyDetector({
    dataDir: path.join(process.cwd(), 'flaky-data')
  });

  console.log(`🔍 Analyzing test history from: ${path.join(process.cwd(), 'flaky-data')}`);
  const report = await detector.generateReport();
  
  console.log(detector.formatReportForCLI(report));
  
  if (report.flakyTests > 0) {
    console.log('\n💡 Recommendation: Run `barrhawk quarantine` to isolate these tests.');
    process.exit(1);
  } else {
    console.log('\n✨ All clear! No flaky tests detected.');
    process.exit(0);
  }
}

main().catch(console.error);

