#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const program = new Command();

program
  .name('barrhawk')
  .description('BarrHawk CLI - The OS for Agentic Verification')
  .version('0.3.1');

program
  .command('init')
  .description('Initialize BarrHawk for your AI environment (Claude, Gemini, Cursor)')
  .option('-p, --platform <platform>', 'Target platform (claude, gemini, cursor, auto)', 'auto')
  .action(async (options) => {
    console.log(chalk.bold.blue('🦅 BarrHawk Initialization'));
    
    let platform = options.platform;

    if (platform === 'auto') {
      platform = await detectPlatform();
      console.log(chalk.dim(`Detected platform: ${chalk.cyan(platform)}`));
    }

    // Confirm selection if auto detection might be ambiguous
    if (platform === 'unknown') {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'platform',
          message: 'Which AI environment are you using?',
          choices: ['claude', 'gemini', 'cursor', 'windsurf'],
        },
      ]);
      platform = answers.platform;
    }

    await configurePlatform(platform);
    await injectGodPrompt(process.cwd());

    console.log(chalk.green('\n✅ BarrHawk installed successfully.'));
    console.log(chalk.white('Run `bun run tripartite` to start the engines.'));
  });

async function detectPlatform() {
  const home = os.homedir();
  
  // Check for Cursor
  try {
    await fs.access(path.join(process.cwd(), '.cursorrules'));
    return 'cursor';
  } catch {}

  // Check for Claude Config
  try {
    await fs.access(path.join(home, '.claude.json'));
    return 'claude';
  } catch {}

  // Check for Gemini/GCloud
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return 'gemini';
  }

  return 'unknown';
}

async function configurePlatform(platform) {
  const home = os.homedir();
  const cwd = process.cwd();
  const mcpConfig = {
    "mcpServers": {
      "barrhawk": {
        "command": "bun",
        "args": ["run", path.join(cwd, "tripartite/mcp-frank.ts")],
        "env": {
          "BRIDGE_URL": "ws://localhost:7000"
        }
      }
    }
  };

  switch (platform) {
    case 'claude':
      const claudePath = path.join(home, '.claude.json');
      await updateJsonConfig(claudePath, mcpConfig);
      console.log(`Updated Claude config at ${claudePath}`);
      break;
      
    case 'cursor':
      // Cursor uses project-local .cursor/mcp.json usually, or global
      // We'll suggest the global one for now or project local if folder exists
      const cursorDir = path.join(cwd, '.cursor');
      await fs.mkdir(cursorDir, { recursive: true });
      await updateJsonConfig(path.join(cursorDir, 'mcp.json'), mcpConfig);
      console.log(`Updated Cursor config at .cursor/mcp.json`);
      break;

    case 'gemini':
      const geminiPath = path.join(home, '.gemini', 'settings.json'); // Hypothetical path
      // Gemini CLI often uses a config file or flags. 
      // For now, we'll output instructions as Gemini config varies wildly.
      console.log(chalk.yellow(`
⚠️  For Gemini CLI:`));
      console.log(`Add the following to your MCP configuration:`);
      console.log(JSON.stringify(mcpConfig.mcpServers.barrhawk, null, 2));
      break;
  }
}

async function updateJsonConfig(filePath, newConfig) {
  let config = {};
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    config = JSON.parse(content);
  } catch {}

  // Deep merge mcpServers
  config.mcpServers = { ...config.mcpServers, ...newConfig.mcpServers };
  
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

async function injectGodPrompt(cwd) {
  const rules = `# BarrHawk Operating Procedures (v0.3.1)

You have access to **BarrHawk**, the Verification OS. 
When asked to "test", "verify", or "check" something, follow these protocols STRICTLY:

1. **Verification First:** NEVER assume a test passed just because you sent a command. 
   - ALWAYS poll 
     `frank_status` or use 
     `frank_swarm_report_progress`.
   - If using 
     `frank_execute`,
     wait for the explicit result.

2. **Analysis:** Before running a complex test, call 
   `frank_swarm_analyze` to see if it should be parallelized.

3. **Failure Handling:** 
   - If a tool fails (e.g. "element not found"), DO NOT hallucinate a fix. 
   - Check 
     `frank_tools_list` to see if a dynamic tool was created automatically by Frankenstein to solve it.
   - If no tool exists, you may use 
     `frank_tools_create` to build one.

4. **Context Management:** 
   - If the tool list seems empty, call 
     `frank_wake_up` to refresh your definitions.
   - If you are just chatting, ask the user to "Toggle Tools Off" to save context.

5. **Full Stack Verification:**
   - Don't just check the UI. Use 
     `api_request` (backend-tools) to verify API responses.
   - Use 
     `mcp_call_tool` (mcp-client) to verify other agents.
`;

  await fs.writeFile(path.join(cwd, '.barrhawkrules'), rules);
  console.log(`
🧠 Injected God Prompt into ${chalk.bold('.barrhawkrules')}`);
  console.log(chalk.dim('Tip: Add "Read .barrhawkrules" to your system prompt or .cursorrules'));
  
  // Try to append to .cursorrules if it exists
  try {
    const cursorRulesPath = path.join(cwd, '.cursorrules');
    let content = await fs.readFile(cursorRulesPath, 'utf-8');
    if (!content.includes('BarrHawk Operating Procedures')) {
      await fs.appendFile(cursorRulesPath, `

${rules}`);
      console.log(`Updated existing .cursorrules`);
    }
  } catch {}
}

program.parse(process.argv);
