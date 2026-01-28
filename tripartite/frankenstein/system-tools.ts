/**
 * SYSTEM TOOLS - Low-level desktop automation for Frank
 *
 * Provides tools for:
 * - Desktop screenshots (grim, spectacle, gnome-screenshot)
 * - Mouse control (ydotool, xdotool)
 * - Keyboard control (ydotool, xdotool)
 * - Window management
 *
 * Auto-detects available tools and uses the best option.
 */

import { createLogger } from '../shared/logger.js';

const logger = createLogger({
  component: 'system-tools',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Tool Detection
// =============================================================================

interface AvailableTools {
  screenshot: 'grim' | 'spectacle' | 'gnome-screenshot' | 'scrot' | null;
  mouse: 'ydotool' | 'xdotool' | null;
  keyboard: 'ydotool' | 'xdotool' | null;
  window: 'xdotool' | 'wmctrl' | null;
}

let detectedTools: AvailableTools | null = null;

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', cmd], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function detectTools(): Promise<AvailableTools> {
  if (detectedTools) return detectedTools;

  logger.info('Detecting available system tools...');

  // Screenshot tools (priority order)
  let screenshot: AvailableTools['screenshot'] = null;
  if (await commandExists('grim')) {
    screenshot = 'grim';
  } else if (await commandExists('spectacle')) {
    screenshot = 'spectacle';
  } else if (await commandExists('gnome-screenshot')) {
    screenshot = 'gnome-screenshot';
  } else if (await commandExists('scrot')) {
    screenshot = 'scrot';
  }

  // Mouse/keyboard tools (ydotool for Wayland, xdotool for X11)
  let mouse: AvailableTools['mouse'] = null;
  let keyboard: AvailableTools['keyboard'] = null;

  if (await commandExists('ydotool')) {
    mouse = 'ydotool';
    keyboard = 'ydotool';
  } else if (await commandExists('xdotool')) {
    mouse = 'xdotool';
    keyboard = 'xdotool';
  }

  // Window management
  let window: AvailableTools['window'] = null;
  if (await commandExists('xdotool')) {
    window = 'xdotool';
  } else if (await commandExists('wmctrl')) {
    window = 'wmctrl';
  }

  detectedTools = { screenshot, mouse, keyboard, window };

  logger.info('Detected tools:', detectedTools);
  return detectedTools;
}

// =============================================================================
// Exec Helper
// =============================================================================

async function exec(cmd: string, args: string[] = []): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

// =============================================================================
// Screenshot Functions
// =============================================================================

export interface ScreenshotOptions {
  region?: { x: number; y: number; width: number; height: number };
  window?: string;  // Window name/id
  output?: string;  // File path
  delay?: number;   // Delay in seconds
}

export async function takeScreenshot(options: ScreenshotOptions = {}): Promise<{
  base64: string;
  path: string;
  tool: string;
}> {
  const tools = await detectTools();

  if (!tools.screenshot) {
    throw new Error('No screenshot tool available. Install grim, spectacle, or scrot.');
  }

  const timestamp = Date.now();
  const path = options.output || `/tmp/frank_screenshot_${timestamp}.png`;

  let result;

  switch (tools.screenshot) {
    case 'grim': {
      // grim is Wayland-native
      const args = ['-o', path];
      if (options.region) {
        const { x, y, width, height } = options.region;
        args.unshift('-g', `${x},${y} ${width}x${height}`);
      }
      result = await exec('grim', args);
      break;
    }

    case 'spectacle': {
      // KDE Spectacle
      const args = ['-b', '-n', '-o', path];
      if (options.region) {
        args.push('-r');  // Region mode (interactive, but with -b and -n)
      }
      if (options.delay) {
        args.push('-d', options.delay.toString());
      }
      result = await exec('spectacle', args);
      break;
    }

    case 'gnome-screenshot': {
      const args = ['-f', path];
      if (options.window) {
        args.push('-w');  // Window mode
      }
      if (options.delay) {
        args.push('-d', options.delay.toString());
      }
      result = await exec('gnome-screenshot', args);
      break;
    }

    case 'scrot': {
      const args = [path];
      if (options.delay) {
        args.unshift('-d', options.delay.toString());
      }
      result = await exec('scrot', args);
      break;
    }
  }

  if (result.exitCode !== 0) {
    throw new Error(`Screenshot failed: ${result.stderr}`);
  }

  // Read and convert to base64
  const file = Bun.file(path);
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');

  return { base64, path, tool: tools.screenshot };
}

// =============================================================================
// Mouse Functions
// =============================================================================

export interface MouseMoveOptions {
  x: number;
  y: number;
  relative?: boolean;  // Move relative to current position
}

export interface MouseClickOptions {
  button?: 'left' | 'right' | 'middle';
  x?: number;
  y?: number;
  clicks?: number;  // Double click = 2
}

export async function mouseMove(options: MouseMoveOptions): Promise<void> {
  const tools = await detectTools();

  if (!tools.mouse) {
    throw new Error('No mouse tool available. Install ydotool or xdotool.');
  }

  switch (tools.mouse) {
    case 'ydotool': {
      const args = options.relative
        ? ['mousemove', '--', options.x.toString(), options.y.toString()]
        : ['mousemove', '-a', '--', options.x.toString(), options.y.toString()];
      await exec('ydotool', args);
      break;
    }

    case 'xdotool': {
      const args = options.relative
        ? ['mousemove_relative', '--', options.x.toString(), options.y.toString()]
        : ['mousemove', '--', options.x.toString(), options.y.toString()];
      await exec('xdotool', args);
      break;
    }
  }
}

export async function mouseClick(options: MouseClickOptions = {}): Promise<void> {
  const tools = await detectTools();

  if (!tools.mouse) {
    throw new Error('No mouse tool available. Install ydotool or xdotool.');
  }

  const button = options.button || 'left';
  const buttonMap = { left: 1, middle: 2, right: 3 };
  const buttonNum = buttonMap[button];
  const clicks = options.clicks || 1;

  // Move first if coordinates provided
  if (options.x !== undefined && options.y !== undefined) {
    await mouseMove({ x: options.x, y: options.y });
    await new Promise(r => setTimeout(r, 50));  // Small delay
  }

  switch (tools.mouse) {
    case 'ydotool': {
      // ydotool uses hex codes for buttons
      const buttonCode = button === 'left' ? '0x00' : button === 'right' ? '0x01' : '0x02';
      for (let i = 0; i < clicks; i++) {
        await exec('ydotool', ['click', buttonCode]);
        if (i < clicks - 1) await new Promise(r => setTimeout(r, 50));
      }
      break;
    }

    case 'xdotool': {
      for (let i = 0; i < clicks; i++) {
        await exec('xdotool', ['click', buttonNum.toString()]);
        if (i < clicks - 1) await new Promise(r => setTimeout(r, 50));
      }
      break;
    }
  }
}

export async function mouseDrag(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  button: 'left' | 'right' | 'middle' = 'left'
): Promise<void> {
  const tools = await detectTools();

  if (!tools.mouse) {
    throw new Error('No mouse tool available. Install ydotool or xdotool.');
  }

  const buttonNum = button === 'left' ? 1 : button === 'right' ? 3 : 2;

  switch (tools.mouse) {
    case 'xdotool': {
      // xdotool has drag support
      await exec('xdotool', [
        'mousemove', fromX.toString(), fromY.toString(),
        'mousedown', buttonNum.toString(),
        'mousemove', toX.toString(), toY.toString(),
        'mouseup', buttonNum.toString(),
      ]);
      break;
    }

    case 'ydotool': {
      // ydotool needs manual sequence
      await mouseMove({ x: fromX, y: fromY });
      await new Promise(r => setTimeout(r, 50));
      // Mouse down
      await exec('ydotool', ['click', '0x40']);  // Button down
      await mouseMove({ x: toX, y: toY });
      // Mouse up
      await exec('ydotool', ['click', '0x80']);  // Button up
      break;
    }
  }
}

// =============================================================================
// Keyboard Functions
// =============================================================================

export async function typeText(text: string, delay = 0): Promise<void> {
  const tools = await detectTools();

  if (!tools.keyboard) {
    throw new Error('No keyboard tool available. Install ydotool or xdotool.');
  }

  switch (tools.keyboard) {
    case 'ydotool': {
      const args = ['type'];
      if (delay > 0) {
        args.push('--delay', delay.toString());
      }
      args.push('--', text);
      await exec('ydotool', args);
      break;
    }

    case 'xdotool': {
      const args = ['type'];
      if (delay > 0) {
        args.push('--delay', delay.toString());
      }
      args.push('--', text);
      await exec('xdotool', args);
      break;
    }
  }
}

export async function pressKey(key: string, modifiers: string[] = []): Promise<void> {
  const tools = await detectTools();

  if (!tools.keyboard) {
    throw new Error('No keyboard tool available. Install ydotool or xdotool.');
  }

  // Build key combo (e.g., "ctrl+shift+a")
  const combo = [...modifiers, key].join('+');

  switch (tools.keyboard) {
    case 'ydotool': {
      await exec('ydotool', ['key', combo]);
      break;
    }

    case 'xdotool': {
      await exec('xdotool', ['key', combo]);
      break;
    }
  }
}

// =============================================================================
// Window Functions
// =============================================================================

export interface WindowInfo {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function listWindows(): Promise<WindowInfo[]> {
  const tools = await detectTools();

  if (!tools.window) {
    throw new Error('No window tool available. Install xdotool or wmctrl.');
  }

  const windows: WindowInfo[] = [];

  switch (tools.window) {
    case 'xdotool': {
      const { stdout } = await exec('xdotool', ['search', '--name', '']);
      const ids = stdout.trim().split('\n').filter(Boolean);

      for (const id of ids.slice(0, 20)) {  // Limit to 20 windows
        try {
          const { stdout: name } = await exec('xdotool', ['getwindowname', id]);
          const { stdout: geo } = await exec('xdotool', ['getwindowgeometry', '--shell', id]);

          // Parse geometry
          const geoMap: Record<string, number> = {};
          for (const line of geo.split('\n')) {
            const [key, val] = line.split('=');
            if (key && val) geoMap[key.toLowerCase()] = parseInt(val);
          }

          windows.push({
            id,
            name: name.trim(),
            x: geoMap.x || 0,
            y: geoMap.y || 0,
            width: geoMap.width || 0,
            height: geoMap.height || 0,
          });
        } catch {
          // Skip windows we can't query
        }
      }
      break;
    }

    case 'wmctrl': {
      const { stdout } = await exec('wmctrl', ['-l', '-G']);
      for (const line of stdout.split('\n')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 8) {
          windows.push({
            id: parts[0],
            name: parts.slice(7).join(' '),
            x: parseInt(parts[2]),
            y: parseInt(parts[3]),
            width: parseInt(parts[4]),
            height: parseInt(parts[5]),
          });
        }
      }
      break;
    }
  }

  return windows;
}

export async function focusWindow(windowId: string): Promise<void> {
  const tools = await detectTools();

  if (!tools.window) {
    throw new Error('No window tool available. Install xdotool or wmctrl.');
  }

  switch (tools.window) {
    case 'xdotool': {
      await exec('xdotool', ['windowactivate', windowId]);
      break;
    }

    case 'wmctrl': {
      await exec('wmctrl', ['-i', '-a', windowId]);
      break;
    }
  }
}

export async function findWindowByName(name: string): Promise<string | null> {
  const tools = await detectTools();

  if (!tools.window) {
    throw new Error('No window tool available. Install xdotool or wmctrl.');
  }

  switch (tools.window) {
    case 'xdotool': {
      const { stdout, exitCode } = await exec('xdotool', ['search', '--name', name]);
      if (exitCode === 0 && stdout.trim()) {
        return stdout.trim().split('\n')[0];
      }
      return null;
    }

    case 'wmctrl': {
      const { stdout } = await exec('wmctrl', ['-l']);
      for (const line of stdout.split('\n')) {
        if (line.toLowerCase().includes(name.toLowerCase())) {
          return line.split(/\s+/)[0];
        }
      }
      return null;
    }
  }

  return null;
}

// =============================================================================
// Export System Tool Definitions for Dynamic Tools
// =============================================================================

export function getSystemToolDefinitions(): Array<{
  name: string;
  description: string;
  code: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}> {
  // These use exec() from the dynamic tool context instead of module imports
  // so they work inside new Function() compiled tools
  return [
    {
      name: 'desktop_screenshot',
      description: 'Take an OS-level screenshot of the entire desktop (captures everything including sidebars, browser chrome, system dialogs)',
      code: `
        const filepath = params.output || '/tmp/frank_desktop_' + Date.now() + '.png';
        // Kill stale spectacle processes
        await exec('pkill -9 spectacle 2>/dev/null || true');
        await sleep(300);
        // Try screenshot tools in priority order
        let result = await exec('spectacle -b -n -o "' + filepath + '" 2>/dev/null');
        if (result.exitCode !== 0) {
          result = await exec('grim "' + filepath + '" 2>/dev/null');
        }
        if (result.exitCode !== 0) {
          result = await exec('scrot "' + filepath + '" 2>/dev/null');
        }
        if (result.exitCode !== 0) {
          result = await exec('import -window root "' + filepath + '" 2>/dev/null');
        }
        // Read file size to verify
        const statResult = await exec('stat -c %s "' + filepath + '" 2>/dev/null');
        const size = parseInt(statResult.stdout.trim()) || 0;
        if (size === 0) throw new Error('Screenshot failed - no tool produced output');
        // Convert to base64 if requested
        let base64 = null;
        if (params.base64) {
          const b64Result = await exec('base64 -w0 "' + filepath + '"');
          base64 = b64Result.stdout;
        }
        return { path: filepath, size, base64, tool: 'os-level' };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          output: { type: 'string', description: 'Output file path (default: /tmp/frank_desktop_<ts>.png)' },
          base64: { type: 'boolean', description: 'Also return base64-encoded image data' },
        },
      },
    },
    {
      name: 'mouse_click',
      description: 'Click the mouse at specified OS-level coordinates (works outside the DOM - browser chrome, sidebars, system UI)',
      code: `
        const x = params.x;
        const y = params.y;
        const btn = params.button === 'right' ? 3 : params.button === 'middle' ? 2 : 1;
        if (x !== undefined && y !== undefined) {
          await exec('xdotool mousemove ' + x + ' ' + y);
          await sleep(50);
        }
        const clicks = params.clicks || 1;
        for (let i = 0; i < clicks; i++) {
          await exec('xdotool click ' + btn);
          if (i < clicks - 1) await sleep(50);
        }
        return { clicked: true, x, y, button: params.button || 'left', clicks };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
          clicks: { type: 'number', description: 'Number of clicks (default: 1, use 2 for double-click)' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'mouse_move',
      description: 'Move the mouse to specified OS-level coordinates',
      code: `
        await exec('xdotool mousemove ' + params.x + ' ' + params.y);
        return { moved: true, x: params.x, y: params.y };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'mouse_drag',
      description: 'Drag the mouse from one position to another (useful for resizing sidebars, panels)',
      code: `
        const btn = params.button === 'right' ? 3 : params.button === 'middle' ? 2 : 1;
        await exec('xdotool mousemove ' + params.fromX + ' ' + params.fromY
          + ' mousedown ' + btn
          + ' mousemove ' + params.toX + ' ' + params.toY
          + ' mouseup ' + btn);
        return { dragged: true, from: { x: params.fromX, y: params.fromY }, to: { x: params.toX, y: params.toY } };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          fromX: { type: 'number', description: 'Start X coordinate' },
          fromY: { type: 'number', description: 'Start Y coordinate' },
          toX: { type: 'number', description: 'End X coordinate' },
          toY: { type: 'number', description: 'End Y coordinate' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button (default: left)' },
        },
        required: ['fromX', 'fromY', 'toX', 'toY'],
      },
    },
    {
      name: 'keyboard_type',
      description: 'Type text using OS-level keyboard input (works in any focused window)',
      code: `
        const delay = params.delay || 0;
        const cmd = 'xdotool type' + (delay > 0 ? ' --delay ' + delay : '') + ' -- "' + params.text.replace(/"/g, '\\\\"') + '"';
        await exec(cmd);
        return { typed: true, text: params.text };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          delay: { type: 'number', description: 'Delay between keystrokes in ms (default: 0)' },
        },
        required: ['text'],
      },
    },
    {
      name: 'keyboard_press',
      description: 'Press a key or key combination at OS level (e.g., ctrl+b for sidebar, F12 for devtools, Escape, Tab)',
      code: `
        const modifiers = params.modifiers || [];
        const combo = [...modifiers, params.key].join('+');
        await exec('xdotool key ' + combo);
        return { pressed: true, combo };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to press (e.g., Return, Tab, Escape, b, F12)' },
          modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifier keys (ctrl, shift, alt, super)' },
        },
        required: ['key'],
      },
    },
    {
      name: 'window_list',
      description: 'List all OS windows with their IDs, names, and positions',
      code: `
        const { stdout } = await exec('xdotool search --name "" 2>/dev/null || true');
        const ids = stdout.trim().split('\\n').filter(Boolean).slice(0, 20);
        const windows = [];
        for (const id of ids) {
          try {
            const { stdout: name } = await exec('xdotool getwindowname ' + id + ' 2>/dev/null');
            const { stdout: geo } = await exec('xdotool getwindowgeometry --shell ' + id + ' 2>/dev/null');
            const geoMap = {};
            for (const line of geo.split('\\n')) {
              const [key, val] = line.split('=');
              if (key && val) geoMap[key.toLowerCase()] = parseInt(val);
            }
            if (name.trim()) {
              windows.push({ id, name: name.trim(), x: geoMap.x || 0, y: geoMap.y || 0, width: geoMap.width || 0, height: geoMap.height || 0 });
            }
          } catch {}
        }
        return { windows, count: windows.length };
      `,
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'window_focus',
      description: 'Focus a window by ID or name (partial match). Use to switch to Chrome, sidebar panels, etc.',
      code: `
        let windowId = params.id;
        if (!windowId && params.name) {
          const { stdout, exitCode } = await exec('xdotool search --name "' + params.name.replace(/"/g, '\\\\"') + '" 2>/dev/null');
          if (exitCode === 0 && stdout.trim()) {
            windowId = stdout.trim().split('\\n')[0];
          }
        }
        if (!windowId) throw new Error('Window not found: ' + (params.name || params.id));
        await exec('xdotool windowactivate ' + windowId);
        return { focused: true, windowId };
      `,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Window ID (from window_list)' },
          name: { type: 'string', description: 'Window name (partial match, e.g., "Chrome", "Firefox")' },
        },
      },
    },
  ];
}

// Auto-detect tools on module load
detectTools().catch(err => {
  logger.warn('Failed to detect system tools:', err);
});
