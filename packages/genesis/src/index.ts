import { execa } from 'execa';
import * as fs from 'fs/promises';
import { getAIBackend } from '@barrhawk/ai-backend';

/**
 * PROJECT GENESIS - Self-Healing Code Loop
 */

export async function genesis_fix(
  testCommand: string, 
  targetFile: string, 
  maxAttempts: number = 3
): Promise<{ success: boolean; attempts: number; finalError?: string }> {
  
  const backend = getAIBackend();

  for (let i = 0; i < maxAttempts; i++) {
    // 1. Run Test
    try {
      await execa('sh', ['-c', testCommand]);
      // If no error, we are green!
      return { success: true, attempts: i + 1 };
    } catch (err: any) {
      const errorOutput = err.stderr || err.stdout;
      console.log(`[Genesis] Attempt ${i+1} failed. Fixing...`);

      // 2. Read Code
      const code = await fs.readFile(targetFile, 'utf-8');

      // 3. Prompt AI
      const prompt = `
        You are an Autonomous Engineer.
        The test failed with this error:
        ${errorOutput}

        Here is the source code (${targetFile}):
        ```
        ${code}
        ```

        Return the FIXED code block ONLY. No yapping.
      `;

      const response = await backend.complete(prompt);
      
      // Extract code block
      const codeMatch = response.match(/```(?:typescript|js|ts)?\n([\s\S]*?)```/);
      const fixedCode = codeMatch ? codeMatch[1] : response;

      // 4. Apply Fix
      await fs.writeFile(targetFile, fixedCode);
    }
  }

  return { success: false, attempts: maxAttempts, finalError: 'Max attempts reached' };
}

