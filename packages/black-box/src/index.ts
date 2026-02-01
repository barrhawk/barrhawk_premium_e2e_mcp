import { zip } from 'zip-a-folder';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function packSession(planId: string, artifactsDir: string, outputDir: string): Promise<string> {
  const planDir = path.join(artifactsDir, planId);
  const outputFile = path.join(outputDir, `${planId}.hawk`);

  // Ensure output dir exists
  await fs.mkdir(outputDir, { recursive: true });

  // Pack it up
  await zip(planDir, outputFile);
  
  return outputFile;
}

export async function unpackSession(hawkFile: string, outputDir: string): Promise<void> {
  // Logic to unzip would go here (using adm-zip or similar)
  // For now, this is a placeholder for the logic
}
