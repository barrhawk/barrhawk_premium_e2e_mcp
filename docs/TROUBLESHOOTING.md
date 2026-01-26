# BarrHawk Troubleshooting Guide

> Last Updated: 2026-01-26

Solutions for common issues when running BarrHawk.

## Table of Contents

1. [Claude Code CLI Issues](#claude-code-cli-issues)
2. [Component Connection Issues](#component-connection-issues)
3. [Browser Automation Issues](#browser-automation-issues)
4. [Tool Creation Issues](#tool-creation-issues)
5. [Performance Issues](#performance-issues)
6. [MCP Configuration Issues](#mcp-configuration-issues)

---

## Claude Code CLI Issues

### CLI Hangs or Freezes

**Symptoms:**
- Claude Code shows "Thinking..." or "Ruminating..." indefinitely
- No response after tool execution
- Process becomes unresponsive

**Known Issue:** This is a [documented upstream issue](https://github.com/anthropics/claude-code/issues/13240) with Claude Code CLI.

**Solutions:**

1. **Force kill and resume:**
   ```bash
   # Find the process
   ps aux | grep claude

   # Kill it
   kill -9 <PID>

   # Resume session
   claude /resume
   ```

2. **Use shorter sessions:**
   - Break long tasks into smaller chunks
   - Start fresh sessions periodically

3. **Monitor session length:**
   - Performance degrades after multiple autocompact operations
   - Consider restarting after 30+ minutes of heavy use

4. **Use tripartite health checks:**
   ```bash
   # If tripartite is running, components auto-restart
   curl http://localhost:7000/health
   ```

5. **Consider Gemini branch (coming soon):**
   - A `gemini-native` branch is in development for improved stability

---

### "No messages returned" Error

**Symptoms:**
- CLI freezes with "No messages returned" in logs
- Happens during automated/long-running scripts

**Solutions:**
- Reduce task complexity
- Add delays between rapid tool calls
- Use `frank_swarm_execute` for parallel work instead of sequential calls

---

## Component Connection Issues

### Component Won't Connect to Bridge

**Symptoms:**
- "Connection refused" errors
- Component health check fails
- "Bridge not found" in logs

**Solutions:**

1. **Verify Bridge is running first:**
   ```bash
   curl http://localhost:7000/health
   ```

2. **Check port availability:**
   ```bash
   lsof -i :7000
   lsof -i :7001
   lsof -i :7002
   lsof -i :7003
   ```

3. **Kill conflicting processes:**
   ```bash
   # Kill all tripartite processes
   pkill -f "tripartite"

   # Restart clean
   cd tripartite && ./start.sh
   ```

4. **Check circuit breaker state:**
   ```bash
   curl http://localhost:7000/health | jq '.circuitBreakers'
   ```

   If a circuit breaker is OPEN, wait 30 seconds or restart the component.

---

### Components Disconnecting Randomly

**Symptoms:**
- Intermittent "component disconnected" messages
- Tasks fail mid-execution

**Solutions:**

1. **Check memory usage:**
   ```bash
   free -h
   htop
   ```

2. **Increase connection health check interval:**
   Environment variable: `HEALTH_CHECK_INTERVAL=5000` (5 seconds)

3. **Check for rate limiting:**
   ```bash
   curl http://localhost:7000/health | jq '.rateLimiterStats'
   ```

   If `totalRejected > 0`, you may be hitting rate limits.

---

## Browser Automation Issues

### Browser Won't Launch

**Symptoms:**
- "Browser failed to launch" error
- Timeout on `frank_browser_launch`

**Solutions:**

1. **Install Playwright browsers:**
   ```bash
   npx playwright install chromium
   ```

2. **Check for existing browser processes:**
   ```bash
   pkill -f chromium
   pkill -f chrome
   ```

3. **Linux sandbox issues:**
   ```bash
   # Disable sandbox (development only)
   export PLAYWRIGHT_CHROMIUM_SANDBOX=0

   # Or fix permissions
   sudo sysctl -w kernel.unprivileged_userns_clone=1
   ```

4. **Run headless:**
   ```json
   {
     "headless": true
   }
   ```

---

### Element Not Found

**Symptoms:**
- "element not found" errors
- Selectors that worked before now fail

**Solutions:**

1. **Wait for page load:**
   Use `frank_browser_navigate` with sufficient timeout

2. **Use text-based selection:**
   ```json
   {
     "text": "Submit"
   }
   ```
   Instead of:
   ```json
   {
     "selector": "#submit-btn"
   }
   ```

3. **Let Failure→Create generate a smart selector:**
   After 2 failures on the same selector, Doctor will request a `smart_selector` tool from Frankenstein.

4. **Check iframe/shadow DOM:**
   Elements inside iframes or shadow DOM need special handling.

---

### Screenshots Not Saving

**Symptoms:**
- `frank_screenshot` returns empty or error
- Screenshot files not appearing

**Solutions:**

1. **Check screenshot directory:**
   ```bash
   ls -la /tmp/tripartite-screenshots/
   ```

2. **Verify browser is active:**
   ```bash
   curl http://localhost:7003/health | jq '.browserActive'
   ```

3. **Create directory if missing:**
   ```bash
   mkdir -p /tmp/tripartite-screenshots
   chmod 755 /tmp/tripartite-screenshots
   ```

---

## Tool Creation Issues

### Tools Not Being Created Automatically

**Symptoms:**
- Repeated failures don't trigger tool creation
- `frank_tools_list` shows no new tools

**Solutions:**

1. **Verify feature is enabled:**
   ```bash
   echo $FRANK_TOOL_CREATION_ENABLED  # Should be "true"
   ```

2. **Check failure threshold:**
   Default is 2 failures. Check Doctor's tracking:
   ```bash
   curl http://localhost:7001/frank | jq '.failurePatterns'
   ```

3. **Verify Frankenstein is connected:**
   ```bash
   curl http://localhost:7000/health | jq '.connectedComponents.frankenstein'
   ```

4. **Check for pattern match:**
   Not all errors trigger tool creation. Tool-worthy patterns:
   - `element not found`, `selector not found` → smart_selector
   - `timeout`, `timed out` → wait_helper
   - `popup`, `modal`, `dialog` → popup_handler

---

### Dynamic Tool Creation Fails

**Symptoms:**
- `frank_tools_create` returns error
- Tool appears but doesn't work

**Solutions:**

1. **Check for syntax errors in code:**
   Tool code must be valid JavaScript.

2. **Check security scan:**
   Blocked patterns:
   - `process.exit`
   - `eval()`
   - `new Function()`
   - `require()`
   - `child_process`
   - `while(true)`, `for(;;)`

3. **View error details:**
   ```bash
   curl http://localhost:7003/tools | jq '.errors'
   ```

---

## Performance Issues

### Slow Response Times

**Symptoms:**
- Tools take longer than expected
- Noticeable lag between operations

**Solutions:**

1. **Check component health:**
   ```bash
   for port in 7000 7001 7002 7003; do
     echo "Port $port:"
     curl -s http://localhost:$port/health | jq '.status'
   done
   ```

2. **Check message queue depth:**
   ```bash
   curl http://localhost:7000/health | jq '.queueDepth'
   ```
   If > 10, system is backlogged.

3. **Reduce parallel operations:**
   Lower `maxIgors` in swarm operations.

4. **Check memory pressure:**
   ```bash
   curl http://localhost:7000/health | jq '.memoryPressure'
   ```
   If > 0.8, consider restarting components.

---

### Lightning Strike Not Escalating

**Symptoms:**
- Igor stays in "dumb" mode despite failures
- `frank_lightning_status` shows mode: "dumb"

**Solutions:**

1. **Verify API key is set:**
   ```bash
   echo $ANTHROPIC_API_KEY | head -c 10
   ```
   Should show `sk-ant-...`

2. **Check threshold:**
   Default is 3 consecutive failures before escalation.
   ```bash
   curl http://localhost:7002/lightning | jq '.consecutiveFailures'
   ```

3. **Manual escalation:**
   ```json
   {
     "tool": "frank_lightning_strike",
     "reason": "Need Claude reasoning for complex task"
   }
   ```

---

## MCP Configuration Issues

### "Tool not found" in Claude Code

**Symptoms:**
- `/mcp` doesn't show BarrHawk tools
- Tool calls fail with "unknown tool"

**Solutions:**

1. **Check config path:**
   ```bash
   # Claude Code
   cat ~/.claude.json

   # Or Cursor/Windsurf
   cat ~/.cursor/mcp.json
   ```

2. **Use absolute paths:**
   ```json
   {
     "mcpServers": {
       "barrhawk-frank": {
         "command": "bun",
         "args": ["run", "/home/user/barrhawk-premium-e2e/tripartite/mcp-frank.ts"]
       }
     }
   }
   ```
   NOT relative paths like `./tripartite/mcp-frank.ts`

3. **Restart Claude Code completely:**
   ```bash
   pkill -f claude
   claude
   ```

4. **Check MCP server is running:**
   ```bash
   ps aux | grep mcp-frank
   ```

---

### MCP Server Crashes on Startup

**Symptoms:**
- MCP tools never appear
- Error in Claude Code logs

**Solutions:**

1. **Check Bun is installed:**
   ```bash
   bun --version  # Should be >= 1.1.0
   ```

2. **Install dependencies:**
   ```bash
   cd barrhawk-premium-e2e
   bun install
   ```

3. **Test MCP server directly:**
   ```bash
   bun run tripartite/mcp-frank.ts
   ```
   Check for errors in output.

4. **Check for port conflicts:**
   ```bash
   lsof -i :7000-7003
   ```

---

## Getting Help

If these solutions don't resolve your issue:

1. **Check existing issues:** [GitHub Issues](https://github.com/barrhawk/barrhawk_premium_e2e_mcp/issues)

2. **Collect diagnostics:**
   ```bash
   # Health check all components
   for port in 7000 7001 7002 7003; do
     echo "=== Port $port ===" >> barrhawk-diagnostics.txt
     curl -s http://localhost:$port/health >> barrhawk-diagnostics.txt 2>&1
   done

   # System info
   echo "=== System ===" >> barrhawk-diagnostics.txt
   uname -a >> barrhawk-diagnostics.txt
   bun --version >> barrhawk-diagnostics.txt
   ```

3. **File an issue** with the diagnostics attached.
