import { execa } from 'execa';

/**
 * CLI Testing Tools
 * Verify other command line tools work as expected.
 */

export async function cli_run(
  command: string, 
  args: string[], 
  options: { 
    cwd?: string; 
    env?: Record<string, string>; 
    timeout?: number;
    expectExitCode?: number;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number; passed: boolean }> {
  
  try {
    const { stdout, stderr, exitCode } = await execa(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout || 10000,
      reject: false // Don't throw on non-zero exit code
    });

    const passed = options.expectExitCode !== undefined ? exitCode === options.expectExitCode : exitCode === 0;

    return { stdout, stderr, exitCode, passed };
  } catch (error: any) {
    return { 
      stdout: '', 
      stderr: error.message, 
      exitCode: -1, 
      passed: false 
    };
  }
}

export async function cli_assert_output(
  output: string, 
  pattern: string, 
  mode: 'contains' | 'regex' | 'exact' = 'contains'
): Promise<boolean> {
  if (mode === 'regex') {
    return new RegExp(pattern).test(output);
  }
  if (mode === 'exact') {
    return output.trim() === pattern.trim();
  }
  return output.includes(pattern);
}
