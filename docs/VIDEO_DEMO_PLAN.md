# BarrHawk Demo Video Production Plan

## Quick Record (Option 2 - Now Available)

Record a test session using Playwright's built-in video recording:

```bash
# Launch browser with recording
frank_browser_launch with recordVideo: true

# Run your tests...
frank_browser_navigate, frank_browser_type, frank_browser_click, etc.

# Close browser - video is saved automatically
frank_browser_close
# Returns: { video: { path: "/tmp/tripartite-videos/recording-xxx.webm", durationMs: 12345 } }
```

### Check Recording Status
```bash
frank_video_status
# Returns: { isRecording: true, durationMs: 5000, path: "/tmp/tripartite-videos/...", videosDir: "/tmp/tripartite-videos" }
```

---

## Full Production Video (Option 3)

### Concept
A 60-90 second demo video showing BarrHawk's E2E testing capabilities across multiple apps, with the War Room dashboard updating in real-time.

### Shot List

#### Scene 1: Hook (0-10s)
- Split screen: messy CI logs on left, clean BarrHawk dashboard on right
- Text overlay: "E2E Testing Shouldn't Be This Hard"
- Cut to: BarrHawk logo

#### Scene 2: The Setup (10-20s)
- Terminal showing `bun run tripartite` starting the stack
- Quick cuts of health checks passing:
  ```
  Bridge ● Doctor ● Igor ● Frank ●
  ```
- Text: "One command. Four intelligent agents."

#### Scene 3: Login Flow Demo (20-35s)
**Target: FakeBarrHawk (localhost:4002)**

```bash
# Start recording
frank_browser_launch with recordVideo: true, url: "http://localhost:4002"

# Execute login
frank_browser_type selector: 'input[type="email"]', text: "pro@barrhawk.test"
frank_browser_type selector: 'input[type="password"]', text: "pro123"
frank_browser_click selector: 'button[type="submit"]'

# Show dashboard loaded
frank_screenshot
```

- War Room shows: Plan created → Steps executing → PASSED
- Overlay: "Natural language → Working test"

#### Scene 4: E-Commerce Flow (35-50s)
**Target: FakeShopFront (localhost:4001)**

```bash
frank_browser_navigate url: "http://localhost:4001"

# Add to cart flow
frank_browser_click text: "Add to Cart"
frank_browser_click text: "Checkout"
frank_browser_type selector: 'input[name="email"]', text: "test@example.com"
frank_browser_click text: "Place Order"
```

- War Room: Multiple steps, all green
- Text: "Complex flows. Zero flakiness."

#### Scene 5: Failure → Recovery (50-65s)
**Show the self-healing in action**

```bash
# Intentionally use wrong selector
frank_browser_click selector: '#old-button-id'
# Shows error with suggestion

# AI creates fix
frank_tools_create name: "click_checkout_v2", description: "...", code: "..."

# Retry succeeds
```

- War Room: Red step → Tool created → Retry → Green
- Text: "When tests break, BarrHawk adapts."

#### Scene 6: The Dashboard (65-80s)
- Full screen War Room dashboard
- Show:
  - Live browser view
  - Test results with pass/fail badges
  - Metrics: Executed/Passed/Failed/Success%
  - Agent pipeline visualization
- Text: "Real-time observability. Zero setup."

#### Scene 7: Call to Action (80-90s)
- Terminal: `npx @barrhawk/mcp init`
- GitHub stars counter
- Logo + tagline: "BarrHawk - E2E Testing That Thinks"

---

### Recording Setup

#### Desktop Layout (1920x1080)
```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌─────────────────────────────┐  ┌──────────────────────────────┐ │
│  │                             │  │                              │ │
│  │     Browser (1280x720)      │  │    War Room Dashboard        │ │
│  │                             │  │    (640x720)                 │ │
│  │                             │  │                              │ │
│  └─────────────────────────────┘  └──────────────────────────────┘ │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  Terminal (bottom strip) - optional, showing commands          │ │
│  └───────────────────────────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Full Desktop Recording with ffmpeg
```bash
# Start recording
ffmpeg -f x11grab -framerate 30 -video_size 1920x1080 -i :0 \
  -c:v libx264 -preset ultrafast -crf 18 \
  /tmp/barrhawk-demo-raw.mp4

# Run the demo script (see below)

# Stop recording (Ctrl+C)

# Convert to web-friendly format
ffmpeg -i /tmp/barrhawk-demo-raw.mp4 \
  -c:v libx264 -preset slow -crf 22 \
  -c:a aac -b:a 128k \
  barrhawk-demo.mp4
```

---

### Demo Script

Save as `scripts/record-demo.ts`:

```typescript
#!/usr/bin/env bun
/**
 * BarrHawk Demo Recording Script
 *
 * Run with: bun run scripts/record-demo.ts
 *
 * Prerequisites:
 * 1. Start tripartite stack: bun run tripartite
 * 2. Start dashboard: bun run dashboard
 * 3. Start FakeSaaS apps: bun run fakesaas/fakebarrhawk/server.ts
 * 4. Position windows according to layout above
 * 5. Start ffmpeg recording
 * 6. Run this script
 */

const FRANK_URL = 'http://localhost:7003';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function frank(action: string, payload: any = {}) {
  // This would use the MCP tools - placeholder for direct HTTP
  console.log(`[DEMO] ${action}`, payload);
  await sleep(1500); // Visible pacing
}

async function main() {
  console.log('=== BarrHawk Demo Script ===\n');

  // Scene 3: Login Flow
  console.log('Scene 3: Login Flow');
  await frank('browser.launch', { url: 'http://localhost:4002', recordVideo: true });
  await sleep(2000);

  await frank('browser.type', { selector: 'input[type="email"]', text: 'pro@barrhawk.test' });
  await frank('browser.type', { selector: 'input[type="password"]', text: 'pro123' });
  await frank('browser.click', { selector: 'button[type="submit"]' });
  await sleep(3000);

  // Scene 4: E-Commerce
  console.log('\nScene 4: E-Commerce Flow');
  await frank('browser.navigate', { url: 'http://localhost:4001' });
  await sleep(2000);

  await frank('browser.click', { text: 'Add to Cart' });
  await frank('browser.click', { text: 'Checkout' });
  await frank('browser.type', { selector: 'input[name="email"]', text: 'demo@barrhawk.test' });
  await frank('browser.click', { text: 'Place Order' });
  await sleep(3000);

  // Scene 5: Show dashboard
  console.log('\nScene 6: Dashboard Focus');
  await sleep(5000);

  // Cleanup
  console.log('\nClosing browser...');
  await frank('browser.close', {});

  console.log('\n=== Demo Complete ===');
  console.log('Video saved to /tmp/tripartite-videos/');
}

main().catch(console.error);
```

---

### Post-Production

1. **Trim** dead time at start/end
2. **Add text overlays** using kdenlive, DaVinci Resolve, or ffmpeg:
   ```bash
   ffmpeg -i demo.mp4 -vf "drawtext=text='BarrHawk':fontsize=48:fontcolor=white:x=50:y=50" output.mp4
   ```
3. **Add background music** (optional, royalty-free)
4. **Export** at 1080p, 30fps, H.264

---

### Checklist

- [ ] Tripartite stack running
- [ ] War Room dashboard open (localhost:3333)
- [ ] FakeBarrHawk running (localhost:4002)
- [ ] FakeShopFront running (localhost:4001)
- [ ] Windows positioned correctly
- [ ] ffmpeg recording started
- [ ] Demo script tested
- [ ] Post-production done
- [ ] Upload to YouTube/social

---

### Quick Screencast (Minimal Effort)

If you just need something quick:

```bash
# 1. Start recording with Playwright
frank_browser_launch with recordVideo: true, url: "http://localhost:4002"

# 2. Do your demo manually or scripted
frank_browser_type selector: 'input[type="email"]', text: 'demo@example.com'
# ... etc

# 3. Stop and get video
frank_browser_close
# Video at /tmp/tripartite-videos/recording-*.webm
```

Convert to MP4:
```bash
ffmpeg -i /tmp/tripartite-videos/recording-*.webm -c:v libx264 demo.mp4
```

Done. No editing needed for a quick share.
