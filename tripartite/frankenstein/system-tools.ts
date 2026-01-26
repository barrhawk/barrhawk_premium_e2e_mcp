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
  return [
    {
      name: 'desktop_screenshot',
      description: 'Take a screenshot of the entire desktop',
      code: `const { takeScreenshot } = await import('./system-tools.js'); return await takeScreenshot();`,
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'mouse_click',
      description: 'Click the mouse at specified coordinates',
      code: `const { mouseClick } = await import('./system-tools.js'); await mouseClick({ x: params.x, y: params.y, button: params.button || 'left' }); return { clicked: true };`,
      inputSchema: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'X coordinate' },
          y: { type: 'number', description: 'Y coordinate' },
          button: { type: 'string', enum: ['left', 'right', 'middle'], description: 'Mouse button' },
        },
        required: ['x', 'y'],
      },
    },
    {
      name: 'mouse_move',
      description: 'Move the mouse to specified coordinates',
      code: `const { mouseMove } = await import('./system-tools.js'); await mouseMove({ x: params.x, y: params.y }); return { moved: true };`,
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
      name: 'keyboard_type',
      description: 'Type text using the keyboard',
      code: `const { typeText } = await import('./system-tools.js'); await typeText(params.text, params.delay || 0); return { typed: true };`,
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to type' },
          delay: { type: 'number', description: 'Delay between keystrokes in ms' },
        },
        required: ['text'],
      },
    },
    {
      name: 'keyboard_press',
      description: 'Press a key or key combination',
      code: `const { pressKey } = await import('./system-tools.js'); await pressKey(params.key, params.modifiers || []); return { pressed: true };`,
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Key to press (e.g., Return, Tab, a)' },
          modifiers: { type: 'array', items: { type: 'string' }, description: 'Modifier keys (ctrl, shift, alt, super)' },
        },
        required: ['key'],
      },
    },
    {
      name: 'window_list',
      description: 'List all windows',
      code: `const { listWindows } = await import('./system-tools.js'); return await listWindows();`,
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'window_focus',
      description: 'Focus a window by ID or name',
      code: `const { focusWindow, findWindowByName } = await import('./system-tools.js'); const id = params.id || await findWindowByName(params.name); if (!id) throw new Error('Window not found'); await focusWindow(id); return { focused: true };`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Window ID' },
          name: { type: 'string', description: 'Window name (partial match)' },
        },
      },
    },
  ];
}

// Auto-detect tools on module load
detectTools().catch(err => {
  logger.warn('Failed to detect system tools:', err);
});
