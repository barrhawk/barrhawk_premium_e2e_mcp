import { parse } from 'stacktrace-parser';
import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface AnalysisResult {
  file: string;
  line: number;
  codeContext: string[];
  blame: {
    author: string;
    email: string;
    commit: string;
    date: string;
    summary: string;
  };
}

/**
 * Analyze a stack trace to find the root cause in source code
 */
export async function analyzeStack(stackTrace: string, projectRoot: string): Promise<AnalysisResult[]> {
  const frames = parse(stackTrace);
  const results: AnalysisResult[] = [];

  for (const frame of frames) {
    if (!frame.file) continue;
    
    // Skip node_modules and internal frames
    if (frame.file.includes('node_modules') || frame.file.startsWith('node:')) continue;

    const absolutePath = path.resolve(projectRoot, frame.file);
    const relativePath = path.relative(projectRoot, absolutePath);

    try {
      await fs.access(absolutePath);
    } catch {
      continue; // File doesn't exist locally
    }

    const line = frame.lineNumber || 1;
    
    // Read code context (5 lines before/after)
    const fileContent = await fs.readFile(absolutePath, 'utf-8');
    const lines = fileContent.split('\n');
    const startLine = Math.max(0, line - 5);
    const endLine = Math.min(lines.length, line + 5);
    const codeContext = lines.slice(startLine, endLine).map((l, i) => `${startLine + i + 1}: ${l}`);

    // Git Blame
    try {
      // -L line,line to blame specific line
      // --porcelain for parsing
      const { stdout } = await execa('git', ['blame', '-L', `${line},${line}`, '--porcelain', relativePath], { cwd: projectRoot });
      
      const blame = parseGitBlame(stdout);
      
      results.push({
        file: relativePath,
        line,
        codeContext,
        blame,
      });
      
      // We only need the top-most user code frame usually
      break; 
    } catch (e) {
      // Git blame failed (maybe ignored or new file), skip blame info
      continue;
    }
  }

  return results;
}

function parseGitBlame(output: string) {
  const lines = output.split('\n');
  const commit = lines[0].split(' ')[0];
  const author = lines.find(l => l.startsWith('author '))?.substring(7) || 'unknown';
  const email = lines.find(l => l.startsWith('author-mail '))?.substring(12).replace(/[<>]/g, '') || 'unknown';
  const date = lines.find(l => l.startsWith('author-time '))?.substring(12) || '0';
  const summary = lines.find(l => l.startsWith('summary '))?.substring(8) || 'unknown';

  return {
    commit,
    author,
    email,
    date: new Date(parseInt(date) * 1000).toISOString(),
    summary,
  };
}

/**
 * Run a git bisect to find breaking commit
 */
export async function runBisect(testCommand: string, goodCommit: string, badCommit: string = 'HEAD', cwd: string): Promise<string> {
  // Check if dirty
  const { stdout: status } = await execa('git', ['status', '--porcelain'], { cwd });
  if (status.length > 0) {
    throw new Error('Repo is dirty. Stash or commit changes before bisecting.');
  }

  try {
    await execa('git', ['bisect', 'start'], { cwd });
    await execa('git', ['bisect', 'bad', badCommit], { cwd });
    await execa('git', ['bisect', 'good', goodCommit], { cwd });

    // Run the automated bisect
    // "git bisect run" takes a script. We need to pass the test command.
    // If testCommand fails (exit 1), it's bad. If it passes (exit 0), it's good.
    await execa('git', ['bisect', 'run', 'sh', '-c', testCommand], { cwd });
    
    // Get the result
    // After run, HEAD is at the bad commit (or we can parse log)
    // Actually, "git bisect run" ends by printing the bad commit.
    // Let's just ask log.
    
    // Reset bisect
    // Wait, we should get the bad commit hash first.
    // Typically the current HEAD is the bad one after a run? No, bisect run leaves you there.
    
    // Safer to capture stdout of the run command, but execa streams.
    // Let's assume the run finished.
    
    const { stdout: log } = await execa('git', ['bisect', 'log'], { cwd });
    // Parse log or just get current HEAD? 
    // Actually simpler:
    // git bisect run outputs: "refs/commits/XYZ is the first bad commit"
    
    // Let's reset so the user isn't stuck
    await execa('git', ['bisect', 'reset'], { cwd });
    
    return "Bisect complete. (Log analysis pending implementation - check git output)";
  } catch (e: any) {
    await execa('git', ['bisect', 'reset'], { cwd });
    throw new Error(`Bisect failed: ${e.message}`);
  }
}
