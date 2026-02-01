# URL Roaster - Chrome Sidebar Extension

A Chrome extension that roasts (comments on) the current URL. Built specifically to demonstrate the **sidebar testing nightmare**.

## The Testing Problem

Chrome extension sidebars are **impossible to test** with traditional E2E tools:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Window                                              │
│  ┌─────────────────────────────────┐  ┌──────────────────┐  │
│  │                                 │  │                  │  │
│  │    Page Content                 │  │   SIDEBAR        │  │
│  │    (Playwright can see this)    │  │   (INVISIBLE     │  │
│  │                                 │  │    to Playwright)│  │
│  │    page.screenshot() ✓          │  │                  │  │
│  │                                 │  │   No DOM access  │  │
│  │                                 │  │   No URL         │  │
│  │                                 │  │   Separate       │  │
│  │                                 │  │   context        │  │
│  └─────────────────────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Why Traditional Testing Fails

1. **`page.screenshot()`** - Only captures the page DOM
2. **Sidebar has no URL** - Can't navigate to it
3. **Separate execution context** - Can't access sidebar DOM from page
4. **AI agents get confused** - They try to open sidebar as a tab

## The Solution: OS-Level Testing

Use **operating system tools** instead of browser tools:

| Tool | Purpose |
|------|---------|
| `xdotool key ctrl+b` | Send keyboard shortcut to open sidebar |
| `spectacle -b -n -o file.png` | Capture entire screen including sidebar |
| `xdotool mousemove X Y click 1` | Click within sidebar |

### BarrHawk Integration

BarrHawk's **Frankenstein** component provides system-level tools:

```typescript
// System keyboard (triggers sidebar)
await callFrank('/system/keyboard', { keys: 'ctrl+b' });

// OS screenshot (captures everything)
await callFrank('/system/screenshot', { output: 'sidebar.png' });

// System mouse (clicks in sidebar)
await callFrank('/system/mouse', { action: 'click', x: 1500, y: 300 });
```

## Extension Features

- 🔥 **URL Roasting** - Generates spicy comments about any URL
- 📜 **History** - Stores recent roasts
- ⌨️ **Keyboard Shortcut** - Ctrl+B opens sidebar
- 🎨 **Dark Theme** - Easy on the eyes

## Installation

### Manual (for development)

1. Open `chrome://extensions`
2. Enable "Developer Mode"
3. Click "Load unpacked"
4. Select this directory

### Test

```bash
# Standalone test (uses xdotool/spectacle)
bun run test

# BarrHawk integration test (uses Frankenstein)
bun run test:barrhawk
```

## Files

```
sidebar-ext/
├── manifest.json      # Extension manifest (MV3)
├── sidepanel.html     # Sidebar UI
├── sidepanel.js       # Sidebar logic
├── background.js      # Service worker
├── icons/             # Extension icons
├── test-sidebar.ts    # Standalone test
├── test-with-barrhawk.ts  # BarrHawk test
└── README.md
```

## Key Insights

1. **Headless mode won't work** - Sidebars require a real browser UI
2. **Must use `--load-extension`** - No other way to load unpacked extensions
3. **Focus matters** - Must focus browser window before sending keys
4. **Coordinates are tricky** - Sidebar position varies by screen size

## Roast Examples

| URL Pattern | Sample Roast |
|-------------|--------------|
| `github.com` | "Staring at other people's code won't fix yours." |
| `localhost` | "localhost: Where bugs are born and dreams go to die." |
| `youtube.com` | "3 hours later you'll wonder where your life went." |
| `stackoverflow.com` | "Marked as duplicate. Your question has been closed." |

## License

MIT - Built for BarrHawk E2E testing framework
