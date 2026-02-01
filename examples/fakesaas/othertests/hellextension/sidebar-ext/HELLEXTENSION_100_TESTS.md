# HellExtension - 100 Chrome Sidebar Extension Tests

## The Testing Nightmare We're Solving

Chrome extension sidebars exist **OUTSIDE the DOM**. Traditional E2E tools (Playwright, Puppeteer, Cypress, Selenium) **CANNOT** capture them because:

1. Sidebars have no URL
2. They're rendered in a separate Chrome process
3. `page.screenshot()` only captures the web page content
4. The sidebar is like a second tab without a visible address bar

**Solution**: OS-level screenshots using `spectacle` (KDE), `gnome-screenshot`, `scrot`, or ImageMagick `import`.

---

## Test Categories

### Category A: Basic Sidebar Functionality (Tests 1-15)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 1 | sidebar_opens_via_icon | Click extension icon opens sidebar | pending |
| 2 | sidebar_opens_via_ctrl_b | Ctrl+B keyboard shortcut opens sidebar | pending |
| 3 | sidebar_closes_via_icon | Click extension icon again closes sidebar | pending |
| 4 | sidebar_closes_via_escape | Escape key closes sidebar | pending |
| 5 | sidebar_persists_navigation | Sidebar stays open during page navigation | pending |
| 6 | sidebar_width_default | Default sidebar width is correct | pending |
| 7 | sidebar_width_resizable | Sidebar can be resized by dragging | pending |
| 8 | sidebar_width_persists | Sidebar width persists after close/reopen | pending |
| 9 | sidebar_scrollable | Long content in sidebar is scrollable | pending |
| 10 | sidebar_dark_theme | Dark theme renders correctly | pending |
| 11 | sidebar_light_theme | Light theme renders correctly | pending |
| 12 | sidebar_system_theme | System theme detection works | pending |
| 13 | sidebar_responsive_narrow | Sidebar content adapts to narrow width | pending |
| 14 | sidebar_responsive_wide | Sidebar content adapts to wide width | pending |
| 15 | sidebar_focus_trap | Focus stays within sidebar when open | pending |

### Category B: URL Detection & Roasting (Tests 16-35)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 16 | url_detect_google | Detects Google and shows Google-specific roast | pending |
| 17 | url_detect_facebook | Detects Facebook and shows Facebook-specific roast | pending |
| 18 | url_detect_twitter | Detects Twitter/X and shows Twitter-specific roast | pending |
| 19 | url_detect_reddit | Detects Reddit and shows Reddit-specific roast | pending |
| 20 | url_detect_github | Detects GitHub and shows GitHub-specific roast | pending |
| 21 | url_detect_stackoverflow | Detects Stack Overflow and shows SO-specific roast | pending |
| 22 | url_detect_youtube | Detects YouTube and shows YouTube-specific roast | pending |
| 23 | url_detect_amazon | Detects Amazon and shows Amazon-specific roast | pending |
| 24 | url_detect_linkedin | Detects LinkedIn and shows LinkedIn-specific roast | pending |
| 25 | url_detect_localhost | Detects localhost and shows developer roast | pending |
| 26 | url_detect_ip_address | Detects raw IP addresses | pending |
| 27 | url_detect_port_number | Detects URLs with ports | pending |
| 28 | url_detect_query_params | Handles URLs with query parameters | pending |
| 29 | url_detect_hash_fragment | Handles URLs with hash fragments | pending |
| 30 | url_detect_subdomain | Correctly identifies subdomains | pending |
| 31 | url_detect_path_deep | Handles deep path URLs | pending |
| 32 | url_detect_unicode | Handles unicode in URLs | pending |
| 33 | url_detect_encoded | Handles URL-encoded characters | pending |
| 34 | url_detect_update_on_nav | URL updates when user navigates | pending |
| 35 | url_detect_update_on_spa | URL updates on SPA route change | pending |

### Category C: Roast Button & Interactions (Tests 36-50)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 36 | roast_button_clickable | Roast button is clickable | pending |
| 37 | roast_button_keyboard | Roast button activates via keyboard | pending |
| 38 | roast_button_loading | Loading state shows while generating roast | pending |
| 39 | roast_button_disabled_loading | Button disabled during loading | pending |
| 40 | roast_result_displays | Roast result displays after click | pending |
| 41 | roast_result_animation | Roast result has entry animation | pending |
| 42 | roast_randomized | Same URL gives different roasts | pending |
| 43 | roast_copy_button | Copy roast button works | pending |
| 44 | roast_share_button | Share roast button works | pending |
| 45 | roast_history_add | Roast added to history | pending |
| 46 | roast_history_display | History shows previous roasts | pending |
| 47 | roast_history_limit | History limited to 50 items | pending |
| 48 | roast_history_clear | Clear history button works | pending |
| 49 | roast_history_persist | History persists after browser restart | pending |
| 50 | roast_favorite_add | Can favorite a roast | pending |

### Category D: State Management & Storage (Tests 51-65)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 51 | storage_local_read | Reads from chrome.storage.local | pending |
| 52 | storage_local_write | Writes to chrome.storage.local | pending |
| 53 | storage_sync_read | Reads from chrome.storage.sync | pending |
| 54 | storage_sync_write | Writes to chrome.storage.sync | pending |
| 55 | storage_quota_check | Handles storage quota limits | pending |
| 56 | storage_migration | Migrates data between versions | pending |
| 57 | state_background_sync | Background service worker syncs state | pending |
| 58 | state_multiple_tabs | State syncs across multiple tabs | pending |
| 59 | state_race_condition | No race conditions on rapid interactions | pending |
| 60 | state_corrupt_recovery | Recovers from corrupted storage | pending |
| 61 | state_clear_on_uninstall | State clears when extension uninstalled | pending |
| 62 | state_export_json | Can export settings as JSON | pending |
| 63 | state_import_json | Can import settings from JSON | pending |
| 64 | state_reset_defaults | Reset to defaults button works | pending |
| 65 | state_offline_mode | Works when offline | pending |

### Category E: Multi-Tab & Multi-Window (Tests 66-80)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 66 | multitab_sidebar_per_tab | Each tab can have its own sidebar | pending |
| 67 | multitab_url_independent | Each tab shows its own URL | pending |
| 68 | multitab_switch_updates | Switching tabs updates sidebar | pending |
| 69 | multitab_close_tab | Closing tab closes its sidebar | pending |
| 70 | multitab_new_tab | New tab can open sidebar | pending |
| 71 | multiwindow_independent | Different windows have independent sidebars | pending |
| 72 | multiwindow_state_sync | Settings sync across windows | pending |
| 73 | multiwindow_history_sync | History syncs across windows | pending |
| 74 | incognito_mode_works | Extension works in incognito | pending |
| 75 | incognito_no_persist | Incognito doesn't persist history | pending |
| 76 | popup_fallback | Falls back to popup if sidebar unavailable | pending |
| 77 | devtools_integration | Works alongside DevTools | pending |
| 78 | fullscreen_mode | Sidebar behavior in fullscreen | pending |
| 79 | picture_in_picture | Sidebar works with PiP | pending |
| 80 | split_screen | Sidebar works in OS split screen | pending |

### Category F: Error Handling & Edge Cases (Tests 81-90)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 81 | error_invalid_url | Handles invalid URLs gracefully | pending |
| 82 | error_no_permission | Handles permission denied | pending |
| 83 | error_offline | Shows offline message when no network | pending |
| 84 | error_storage_full | Handles storage full gracefully | pending |
| 85 | error_concurrent_ops | Handles concurrent operations | pending |
| 86 | error_memory_pressure | Works under memory pressure | pending |
| 87 | edge_rapid_nav | Handles rapid navigation | pending |
| 88 | edge_very_long_url | Handles extremely long URLs | pending |
| 89 | edge_special_chars | Handles special characters in URL | pending |
| 90 | edge_empty_url | Handles empty/about:blank URL | pending |

### Category G: Visual & Screenshot Verification (Tests 91-100)
| # | Test Name | Description | Status |
|---|-----------|-------------|--------|
| 91 | screenshot_baseline | OS screenshot captures sidebar | pending |
| 92 | screenshot_roast_visible | Roast text visible in screenshot | pending |
| 93 | screenshot_dark_mode | Dark mode renders in screenshot | pending |
| 94 | screenshot_animation_complete | Animations complete before screenshot | pending |
| 95 | screenshot_diff_baseline | Visual diff against baseline | pending |
| 96 | screenshot_multi_monitor | Works on multi-monitor setup | pending |
| 97 | screenshot_hidpi | Works on HiDPI displays | pending |
| 98 | screenshot_scaled | Works with OS scaling | pending |
| 99 | screenshot_comparison | A/B comparison of states | pending |
| 100 | screenshot_full_flow | Full flow screenshot sequence | pending |

---

## How to Run Tests

### Prerequisites
```bash
# Install dependencies
cd sidebar-ext
npm install

# Install Playwright browsers
npx playwright install chromium

# Ensure xdotool and spectacle are available
which xdotool spectacle
```

### Run All Tests
```bash
npm run test:all
```

### Run Single Category
```bash
npm run test:category -- --category=A
```

### Run Single Test
```bash
npm run test:single -- --test=1
```

---

## Test Infrastructure

### OS-Level Screenshot Function
```typescript
async function takeOsScreenshot(filename: string): Promise<string> {
  // Try spectacle (KDE)
  execSync(`spectacle -b -n -o "${filepath}"`);
  // Fallback to gnome-screenshot
  // Fallback to scrot
  // Fallback to ImageMagick import
}
```

### Keyboard Simulation
```typescript
async function sendKeyboardShortcut(keys: string): Promise<void> {
  execSync(`xdotool key ${keys}`);
}
```

### Window Focus
```typescript
async function focusBrowserWindow(): Promise<void> {
  execSync(`xdotool search --name "Chrome" windowactivate`);
}
```

---

## Expected Screenshots Directory Structure

```
/tmp/sidebar-test-screenshots/
├── category-a/
│   ├── 01-sidebar_opens_via_icon-before.png
│   ├── 01-sidebar_opens_via_icon-after.png
│   └── ...
├── category-b/
│   └── ...
└── baselines/
    └── golden/
        └── ...
```

---

## Integration with BarrHawk

The tests can run standalone OR via BarrHawk's Frankenstein system tools:

```typescript
// Via BarrHawk
await invokeTool('desktop_screenshot', {});
await invokeTool('keyboard_press', { key: 'b', modifiers: ['ctrl'] });
await invokeTool('mouse_click', { x: 100, y: 100 });
await invokeTool('window_focus', { name: 'Chrome' });
```

---

## Test Results Summary

| Category | Total | Passed | Failed | Pending |
|----------|-------|--------|--------|---------|
| A: Basic Functionality | 15 | 0 | 0 | 15 |
| B: URL Detection | 20 | 0 | 0 | 20 |
| C: Interactions | 15 | 0 | 0 | 15 |
| D: Storage | 15 | 0 | 0 | 15 |
| E: Multi-Tab | 15 | 0 | 0 | 15 |
| F: Error Handling | 10 | 0 | 0 | 10 |
| G: Screenshots | 10 | 0 | 0 | 10 |
| **TOTAL** | **100** | **0** | **0** | **100** |

---

## Verified Working (from initial test run)

1. Browser launches with extension loaded
2. Navigation to test URLs works
3. OS-level screenshots capture the full browser window including sidebar
4. `xdotool` keyboard shortcuts (Ctrl+B) trigger the sidebar
5. Sidebar opens and displays content
6. Screenshots saved to `/tmp/sidebar-test-screenshots/`

Screenshots from test run:
- `01-baseline-no-sidebar.png` (7.2 MB) - Baseline without sidebar
- `02-with-sidebar.png` (7.4 MB) - With sidebar open
- `03-roast-result.png` (3.8 MB) - After roast interaction

---

## The Key Insight

**Traditional E2E testing CANNOT test Chrome extension sidebars.** The sidebar exists in a separate rendering context that:

1. Has no DOM accessible to Playwright/Puppeteer
2. Has no URL to navigate to
3. Cannot be targeted with CSS selectors
4. Is invisible to `page.screenshot()`

**The ONLY solution is OS-level testing** which captures what the user actually sees, including:
- Chrome browser chrome
- Extension icon in toolbar
- Sidebar panel
- Tab bar and address bar

This is why BarrHawk's Frankenstein system tools (`desktop_screenshot`, `keyboard_press`, `mouse_click`) are essential for testing Chrome extension sidebars.
