/**
 * System-Level Automation Tools
 *
 * Provides OS-level mouse, keyboard, screenshot, and window management
 * for testing Chrome extensions with sidepanels and other native UI.
 *
 * Supports:
 * - Linux X11 (xdotool, scrot)
 * - Linux Wayland (ydotool, spectacle, grim)
 * - macOS (cliclick, screencapture) [future]
 * - Windows (pyautogui) [future]
 */

import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const exec = promisify(execCallback);

// Platform detection
interface PlatformInfo {
    os: 'linux' | 'darwin' | 'win32';
    displayServer: 'x11' | 'wayland' | 'macos' | 'windows' | 'unknown';
    availableTools: {
        screenshot: string[];
        mouse: string[];
        keyboard: string[];
        window: string[];
    };
}

let platformInfo: PlatformInfo | null = null;

/**
 * Detect platform and available tools
 */
export async function detectPlatform(): Promise<PlatformInfo> {
    if (platformInfo) return platformInfo;

    const os = process.platform as 'linux' | 'darwin' | 'win32';
    let displayServer: PlatformInfo['displayServer'] = 'unknown';

    if (os === 'linux') {
        const sessionType = process.env.XDG_SESSION_TYPE || '';
        displayServer = sessionType === 'wayland' ? 'wayland' : 'x11';
    } else if (os === 'darwin') {
        displayServer = 'macos';
    } else if (os === 'win32') {
        displayServer = 'windows';
    }

    // Check available tools
    const availableTools = {
        screenshot: [] as string[],
        mouse: [] as string[],
        keyboard: [] as string[],
        window: [] as string[],
    };

    const toolChecks = [
        // Screenshots
        { tool: 'spectacle', category: 'screenshot' },
        { tool: 'grim', category: 'screenshot' },
        { tool: 'scrot', category: 'screenshot' },
        { tool: 'maim', category: 'screenshot' },
        { tool: 'gnome-screenshot', category: 'screenshot' },
        // Mouse/Keyboard
        { tool: 'ydotool', category: 'mouse' },
        { tool: 'xdotool', category: 'mouse' },
        { tool: 'wtype', category: 'keyboard' },
        // Window management
        { tool: 'wmctrl', category: 'window' },
        { tool: 'xdotool', category: 'window' },
    ];

    for (const { tool, category } of toolChecks) {
        try {
            await exec(`which ${tool}`);
            if (!availableTools[category as keyof typeof availableTools].includes(tool)) {
                availableTools[category as keyof typeof availableTools].push(tool);
            }
        } catch {
            // Tool not available
        }
    }

    // ydotool also handles keyboard
    if (availableTools.mouse.includes('ydotool')) {
        availableTools.keyboard.push('ydotool');
    }
    // xdotool also handles keyboard
    if (availableTools.mouse.includes('xdotool')) {
        availableTools.keyboard.push('xdotool');
    }

    platformInfo = { os, displayServer, availableTools };
    return platformInfo;
}

/**
 * Take a system-wide screenshot
 */
export interface SystemScreenshotOptions {
    target: 'fullscreen' | 'window' | 'region';
    windowName?: string;
    windowId?: string;
    region?: { x: number; y: number; width: number; height: number };
    savePath?: string;
    filename?: string;
    returnBase64?: boolean;
}

export interface SystemScreenshotResult {
    success: boolean;
    path?: string;
    base64?: string;
    error?: string;
    dimensions?: { width: number; height: number };
}

export async function systemScreenshot(options: SystemScreenshotOptions): Promise<SystemScreenshotResult> {
    const platform = await detectPlatform();
    const timestamp = Date.now();
    const filename = options.filename || `system_screenshot_${timestamp}`;
    const tempPath = `/tmp/${filename}.png`;
    const finalPath = options.savePath
        ? path.join(options.savePath, `${filename}.png`)
        : tempPath;

    try {
        // Choose screenshot method based on platform and target
        if (platform.displayServer === 'wayland') {
            await takeWaylandScreenshot(options, tempPath, platform);
        } else if (platform.displayServer === 'x11') {
            await takeX11Screenshot(options, tempPath, platform);
        } else {
            return { success: false, error: `Unsupported platform: ${platform.displayServer}` };
        }

        // Move to final path if different
        if (finalPath !== tempPath) {
            await exec(`mv "${tempPath}" "${finalPath}"`);
        }

        // Get dimensions
        let dimensions: { width: number; height: number } | undefined;
        try {
            const { stdout } = await exec(`identify -format "%w %h" "${finalPath}"`);
            const [width, height] = stdout.trim().split(' ').map(Number);
            dimensions = { width, height };
        } catch {
            // ImageMagick not available
        }

        // Return base64 if requested
        let base64: string | undefined;
        if (options.returnBase64 !== false) {
            const buffer = await readFile(finalPath);
            base64 = buffer.toString('base64');
        }

        return {
            success: true,
            path: finalPath,
            base64,
            dimensions,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || String(error),
        };
    }
}

async function takeWaylandScreenshot(
    options: SystemScreenshotOptions,
    outputPath: string,
    platform: PlatformInfo
): Promise<void> {
    const tools = platform.availableTools.screenshot;

    if (options.target === 'fullscreen') {
        if (tools.includes('spectacle')) {
            // Spectacle: -b = background mode, -f = fullscreen, -n = no notification
            await exec(`spectacle -b -f -n -o "${outputPath}"`);
        } else if (tools.includes('grim')) {
            await exec(`grim "${outputPath}"`);
        } else if (tools.includes('gnome-screenshot')) {
            await exec(`gnome-screenshot -f "${outputPath}"`);
        } else {
            throw new Error('No screenshot tool available for Wayland fullscreen');
        }
    } else if (options.target === 'region' && options.region) {
        const { x, y, width, height } = options.region;
        if (tools.includes('grim')) {
            await exec(`grim -g "${x},${y} ${width}x${height}" "${outputPath}"`);
        } else if (tools.includes('spectacle')) {
            // Spectacle doesn't support region directly, take full and crop
            const fullPath = `/tmp/full_${Date.now()}.png`;
            await exec(`spectacle -b -f -n -o "${fullPath}"`);
            await exec(`convert "${fullPath}" -crop ${width}x${height}+${x}+${y} "${outputPath}"`);
            await unlink(fullPath);
        } else {
            throw new Error('No screenshot tool available for Wayland region capture');
        }
    } else if (options.target === 'window') {
        // Window capture on Wayland is tricky - need window bounds first
        if (options.windowName) {
            const bounds = await getWindowBounds(options.windowName);
            if (bounds) {
                // Take region screenshot of window area
                return takeWaylandScreenshot(
                    { ...options, target: 'region', region: bounds },
                    outputPath,
                    platform
                );
            }
        }
        // Fallback to fullscreen
        return takeWaylandScreenshot({ ...options, target: 'fullscreen' }, outputPath, platform);
    }
}

async function takeX11Screenshot(
    options: SystemScreenshotOptions,
    outputPath: string,
    platform: PlatformInfo
): Promise<void> {
    const tools = platform.availableTools.screenshot;

    if (options.target === 'fullscreen') {
        if (tools.includes('scrot')) {
            await exec(`scrot -o "${outputPath}"`);
        } else if (tools.includes('maim')) {
            await exec(`maim "${outputPath}"`);
        } else {
            throw new Error('No screenshot tool available for X11');
        }
    } else if (options.target === 'window') {
        let windowId = options.windowId;
        if (!windowId && options.windowName) {
            const { stdout } = await exec(`xdotool search --name "${options.windowName}" | head -1`);
            windowId = stdout.trim();
        }
        if (windowId) {
            if (tools.includes('scrot')) {
                await exec(`scrot -w ${windowId} -o "${outputPath}"`);
            } else if (tools.includes('maim')) {
                await exec(`maim -i ${windowId} "${outputPath}"`);
            }
        } else {
            throw new Error(`Window not found: ${options.windowName}`);
        }
    } else if (options.target === 'region' && options.region) {
        const { x, y, width, height } = options.region;
        if (tools.includes('maim')) {
            await exec(`maim -g ${width}x${height}+${x}+${y} "${outputPath}"`);
        } else if (tools.includes('scrot')) {
            // scrot doesn't support region, use import from ImageMagick
            await exec(`import -window root -crop ${width}x${height}+${x}+${y} "${outputPath}"`);
        }
    }
}

/**
 * Get window bounds by name
 */
export interface WindowBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    windowId?: string;
}

export async function getWindowBounds(windowName: string): Promise<WindowBounds | null> {
    const platform = await detectPlatform();

    try {
        if (platform.displayServer === 'x11' || platform.availableTools.window.includes('xdotool')) {
            // Use xdotool (works partially on Xwayland apps)
            const { stdout: idOut } = await exec(`xdotool search --name "${windowName}" | head -1`);
            const windowId = idOut.trim();
            if (!windowId) return null;

            const { stdout: geoOut } = await exec(`xdotool getwindowgeometry --shell ${windowId}`);
            // Parse: X=100\nY=200\nWIDTH=1920\nHEIGHT=1080
            const geo: any = {};
            geoOut.split('\n').forEach(line => {
                const [key, value] = line.split('=');
                if (key && value) geo[key] = parseInt(value, 10);
            });

            return {
                x: geo.X || 0,
                y: geo.Y || 0,
                width: geo.WIDTH || 0,
                height: geo.HEIGHT || 0,
                windowId,
            };
        }

        // Wayland: Try wmctrl or fallback
        if (platform.availableTools.window.includes('wmctrl')) {
            const { stdout } = await exec(`wmctrl -l -G | grep -i "${windowName}"`);
            // Format: 0x12345678  0 100  200  1920 1080  hostname Window Title
            const parts = stdout.trim().split(/\s+/);
            if (parts.length >= 6) {
                return {
                    x: parseInt(parts[2], 10),
                    y: parseInt(parts[3], 10),
                    width: parseInt(parts[4], 10),
                    height: parseInt(parts[5], 10),
                    windowId: parts[0],
                };
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * System mouse control
 */
export interface SystemMouseOptions {
    action: 'move' | 'click' | 'doubleclick' | 'rightclick' | 'middleclick' | 'drag' | 'scroll';
    x: number;
    y: number;
    endX?: number;  // For drag
    endY?: number;
    scrollAmount?: number;  // For scroll (positive = down, negative = up)
    button?: 'left' | 'right' | 'middle';
}

export interface SystemMouseResult {
    success: boolean;
    error?: string;
}

export async function systemMouse(options: SystemMouseOptions): Promise<SystemMouseResult> {
    const platform = await detectPlatform();
    const tools = platform.availableTools.mouse;

    try {
        if (tools.includes('ydotool')) {
            await performYdotoolMouse(options);
        } else if (tools.includes('xdotool') && platform.displayServer === 'x11') {
            await performXdotoolMouse(options);
        } else {
            return {
                success: false,
                error: `No mouse control tool available. Install ydotool: sudo dnf install ydotool`,
            };
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || String(error) };
    }
}

async function performYdotoolMouse(options: SystemMouseOptions): Promise<void> {
    const { action, x, y, endX, endY, scrollAmount } = options;

    // Ensure ydotoold is running
    try {
        await exec('pgrep ydotoold || sudo ydotoold &');
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch {
        // May fail if already running
    }

    switch (action) {
        case 'move':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            break;
        case 'click':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            await exec(`ydotool click 0xC0`);  // Left click
            break;
        case 'rightclick':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            await exec(`ydotool click 0xC1`);  // Right click
            break;
        case 'middleclick':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            await exec(`ydotool click 0xC2`);  // Middle click
            break;
        case 'doubleclick':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            await exec(`ydotool click 0xC0 && ydotool click 0xC0`);
            break;
        case 'drag':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            await exec(`ydotool mousedown 0`);
            await exec(`ydotool mousemove --absolute ${endX} ${endY}`);
            await exec(`ydotool mouseup 0`);
            break;
        case 'scroll':
            await exec(`ydotool mousemove --absolute ${x} ${y}`);
            const direction = (scrollAmount || 0) > 0 ? 'down' : 'up';
            const amount = Math.abs(scrollAmount || 120);
            await exec(`ydotool wheel ${direction === 'down' ? '' : '--'}${amount}`);
            break;
    }
}

async function performXdotoolMouse(options: SystemMouseOptions): Promise<void> {
    const { action, x, y, endX, endY, scrollAmount } = options;

    switch (action) {
        case 'move':
            await exec(`xdotool mousemove ${x} ${y}`);
            break;
        case 'click':
            await exec(`xdotool mousemove ${x} ${y} click 1`);
            break;
        case 'rightclick':
            await exec(`xdotool mousemove ${x} ${y} click 3`);
            break;
        case 'middleclick':
            await exec(`xdotool mousemove ${x} ${y} click 2`);
            break;
        case 'doubleclick':
            await exec(`xdotool mousemove ${x} ${y} click --repeat 2 1`);
            break;
        case 'drag':
            await exec(`xdotool mousemove ${x} ${y} mousedown 1 mousemove ${endX} ${endY} mouseup 1`);
            break;
        case 'scroll':
            await exec(`xdotool mousemove ${x} ${y}`);
            const button = (scrollAmount || 0) > 0 ? 5 : 4;  // 4=up, 5=down
            const clicks = Math.ceil(Math.abs(scrollAmount || 120) / 120);
            await exec(`xdotool click --repeat ${clicks} ${button}`);
            break;
    }
}

/**
 * System keyboard control
 */
export interface SystemKeyboardOptions {
    action: 'type' | 'press' | 'hotkey';
    text?: string;  // For 'type'
    key?: string;   // For 'press': "Return", "Tab", "Escape", etc.
    keys?: string[];  // For 'hotkey': ["ctrl", "shift", "t"]
    delay?: number;  // Delay between keystrokes in ms
}

export interface SystemKeyboardResult {
    success: boolean;
    error?: string;
}

export async function systemKeyboard(options: SystemKeyboardOptions): Promise<SystemKeyboardResult> {
    const platform = await detectPlatform();
    const tools = platform.availableTools.keyboard;

    try {
        if (tools.includes('ydotool')) {
            await performYdotoolKeyboard(options);
        } else if (tools.includes('wtype') && platform.displayServer === 'wayland') {
            await performWtypeKeyboard(options);
        } else if (tools.includes('xdotool') && platform.displayServer === 'x11') {
            await performXdotoolKeyboard(options);
        } else {
            return {
                success: false,
                error: `No keyboard control tool available. Install ydotool: sudo dnf install ydotool`,
            };
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || String(error) };
    }
}

async function performYdotoolKeyboard(options: SystemKeyboardOptions): Promise<void> {
    const { action, text, key, keys, delay } = options;

    switch (action) {
        case 'type':
            if (text) {
                // ydotool type doesn't support delay, so we type character by character
                if (delay && delay > 0) {
                    for (const char of text) {
                        await exec(`ydotool type "${char}"`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } else {
                    await exec(`ydotool type "${text.replace(/"/g, '\\"')}"`);
                }
            }
            break;
        case 'press':
            if (key) {
                await exec(`ydotool key ${mapKeyToYdotool(key)}`);
            }
            break;
        case 'hotkey':
            if (keys && keys.length > 0) {
                // ydotool uses keycodes, need to map
                const keyCodes = keys.map(k => mapKeyToYdotool(k)).join('+');
                await exec(`ydotool key ${keyCodes}`);
            }
            break;
    }
}

async function performWtypeKeyboard(options: SystemKeyboardOptions): Promise<void> {
    const { action, text, key, keys, delay } = options;

    switch (action) {
        case 'type':
            if (text) {
                if (delay && delay > 0) {
                    await exec(`wtype -d ${delay} "${text.replace(/"/g, '\\"')}"`);
                } else {
                    await exec(`wtype "${text.replace(/"/g, '\\"')}"`);
                }
            }
            break;
        case 'press':
            if (key) {
                await exec(`wtype -k ${key}`);
            }
            break;
        case 'hotkey':
            if (keys && keys.length > 0) {
                // wtype -M modifier -k key -m modifier
                const modifiers = keys.slice(0, -1).map(k => `-M ${k}`).join(' ');
                const mainKey = keys[keys.length - 1];
                const releases = keys.slice(0, -1).map(k => `-m ${k}`).join(' ');
                await exec(`wtype ${modifiers} -k ${mainKey} ${releases}`);
            }
            break;
    }
}

async function performXdotoolKeyboard(options: SystemKeyboardOptions): Promise<void> {
    const { action, text, key, keys, delay } = options;

    switch (action) {
        case 'type':
            if (text) {
                const delayArg = delay ? `--delay ${delay}` : '';
                await exec(`xdotool type ${delayArg} "${text.replace(/"/g, '\\"')}"`);
            }
            break;
        case 'press':
            if (key) {
                await exec(`xdotool key ${key}`);
            }
            break;
        case 'hotkey':
            if (keys && keys.length > 0) {
                await exec(`xdotool key ${keys.join('+')}`);
            }
            break;
    }
}

// Key mapping for ydotool (uses Linux keycodes)
function mapKeyToYdotool(key: string): string {
    const keyMap: Record<string, string> = {
        'Return': '28:1 28:0',
        'Enter': '28:1 28:0',
        'Tab': '15:1 15:0',
        'Escape': '1:1 1:0',
        'BackSpace': '14:1 14:0',
        'Delete': '111:1 111:0',
        'space': '57:1 57:0',
        'Up': '103:1 103:0',
        'Down': '108:1 108:0',
        'Left': '105:1 105:0',
        'Right': '106:1 106:0',
        'ctrl': '29:1',
        'control': '29:1',
        'shift': '42:1',
        'alt': '56:1',
        'super': '125:1',
        // Letters
        'a': '30:1 30:0', 'b': '48:1 48:0', 'c': '46:1 46:0',
        // ... add more as needed
    };
    return keyMap[key.toLowerCase()] || key;
}

/**
 * List all windows
 */
export interface WindowInfo {
    id: string;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    focused?: boolean;
}

export async function listWindows(): Promise<WindowInfo[]> {
    const platform = await detectPlatform();
    const windows: WindowInfo[] = [];

    try {
        if (platform.availableTools.window.includes('wmctrl')) {
            const { stdout } = await exec('wmctrl -l -G');
            for (const line of stdout.trim().split('\n')) {
                const parts = line.split(/\s+/);
                if (parts.length >= 8) {
                    windows.push({
                        id: parts[0],
                        name: parts.slice(7).join(' '),
                        x: parseInt(parts[2], 10),
                        y: parseInt(parts[3], 10),
                        width: parseInt(parts[4], 10),
                        height: parseInt(parts[5], 10),
                    });
                }
            }
        } else if (platform.availableTools.window.includes('xdotool')) {
            const { stdout: activeOut } = await exec('xdotool getactivewindow');
            const activeId = activeOut.trim();

            const { stdout: listOut } = await exec('xdotool search --name "."');
            for (const windowId of listOut.trim().split('\n')) {
                if (!windowId) continue;
                try {
                    const { stdout: nameOut } = await exec(`xdotool getwindowname ${windowId}`);
                    const { stdout: geoOut } = await exec(`xdotool getwindowgeometry --shell ${windowId}`);

                    const geo: any = {};
                    geoOut.split('\n').forEach(l => {
                        const [k, v] = l.split('=');
                        if (k && v) geo[k] = parseInt(v, 10);
                    });

                    windows.push({
                        id: windowId,
                        name: nameOut.trim(),
                        x: geo.X || 0,
                        y: geo.Y || 0,
                        width: geo.WIDTH || 0,
                        height: geo.HEIGHT || 0,
                        focused: windowId === activeId,
                    });
                } catch {
                    // Skip windows we can't query
                }
            }
        }
    } catch (error) {
        // Return empty list on error
    }

    return windows;
}

/**
 * Focus a window
 */
export async function focusWindow(windowNameOrId: string): Promise<{ success: boolean; error?: string }> {
    const platform = await detectPlatform();

    try {
        if (platform.availableTools.window.includes('xdotool')) {
            // Try as window ID first
            if (/^\d+$/.test(windowNameOrId) || /^0x[\da-f]+$/i.test(windowNameOrId)) {
                await exec(`xdotool windowactivate ${windowNameOrId}`);
            } else {
                // Search by name
                const { stdout } = await exec(`xdotool search --name "${windowNameOrId}" | head -1`);
                const windowId = stdout.trim();
                if (windowId) {
                    await exec(`xdotool windowactivate ${windowId}`);
                } else {
                    return { success: false, error: `Window not found: ${windowNameOrId}` };
                }
            }
        } else if (platform.availableTools.window.includes('wmctrl')) {
            await exec(`wmctrl -a "${windowNameOrId}"`);
        } else {
            return { success: false, error: 'No window management tool available' };
        }

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message || String(error) };
    }
}

/**
 * Tool definitions for MCP server integration
 */
export const systemToolDefinitions = [
    {
        name: 'system_screenshot',
        description: 'Take a screenshot of the entire screen, a specific window, or a region. Works with Wayland and X11.',
        inputSchema: {
            type: 'object',
            properties: {
                target: {
                    type: 'string',
                    enum: ['fullscreen', 'window', 'region'],
                    description: 'What to capture: fullscreen, specific window, or region',
                    default: 'fullscreen',
                },
                windowName: {
                    type: 'string',
                    description: 'Window name/title to capture (for target=window). Partial match supported.',
                },
                region: {
                    type: 'object',
                    description: 'Region to capture (for target=region)',
                    properties: {
                        x: { type: 'number' },
                        y: { type: 'number' },
                        width: { type: 'number' },
                        height: { type: 'number' },
                    },
                },
                savePath: {
                    type: 'string',
                    description: 'Directory to save screenshot. Defaults to /tmp.',
                },
                filename: {
                    type: 'string',
                    description: 'Custom filename (without extension).',
                },
                returnBase64: {
                    type: 'boolean',
                    description: 'Return image as base64 (default: true)',
                    default: true,
                },
            },
        },
    },
    {
        name: 'system_mouse',
        description: 'Control the mouse at the OS level. Move, click, drag, or scroll anywhere on screen.',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['move', 'click', 'doubleclick', 'rightclick', 'middleclick', 'drag', 'scroll'],
                    description: 'Mouse action to perform',
                },
                x: {
                    type: 'number',
                    description: 'X coordinate (absolute screen position)',
                },
                y: {
                    type: 'number',
                    description: 'Y coordinate (absolute screen position)',
                },
                endX: {
                    type: 'number',
                    description: 'End X coordinate (for drag action)',
                },
                endY: {
                    type: 'number',
                    description: 'End Y coordinate (for drag action)',
                },
                scrollAmount: {
                    type: 'number',
                    description: 'Scroll amount in pixels. Positive = down, negative = up.',
                },
            },
            required: ['action', 'x', 'y'],
        },
    },
    {
        name: 'system_keyboard',
        description: 'Type text or press keys at the OS level. Works in any focused window.',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['type', 'press', 'hotkey'],
                    description: 'Keyboard action: type text, press single key, or hotkey combo',
                },
                text: {
                    type: 'string',
                    description: 'Text to type (for action=type)',
                },
                key: {
                    type: 'string',
                    description: 'Key to press (for action=press). Examples: Return, Tab, Escape, BackSpace',
                },
                keys: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Keys for hotkey combo (for action=hotkey). Example: ["ctrl", "shift", "t"]',
                },
                delay: {
                    type: 'number',
                    description: 'Delay between keystrokes in ms (for action=type)',
                },
            },
            required: ['action'],
        },
    },
    {
        name: 'system_window_list',
        description: 'List all open windows with their positions and sizes.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'system_window_focus',
        description: 'Focus (bring to front) a window by name or ID.',
        inputSchema: {
            type: 'object',
            properties: {
                window: {
                    type: 'string',
                    description: 'Window name (partial match) or window ID',
                },
            },
            required: ['window'],
        },
    },
    {
        name: 'system_window_bounds',
        description: 'Get the position and size of a window.',
        inputSchema: {
            type: 'object',
            properties: {
                windowName: {
                    type: 'string',
                    description: 'Window name/title (partial match)',
                },
            },
            required: ['windowName'],
        },
    },
    {
        name: 'system_platform_info',
        description: 'Get information about the current platform and available system tools.',
        inputSchema: {
            type: 'object',
            properties: {},
        },
    },
    {
        name: 'system_shell',
        description: 'Execute a shell command. Use with caution.',
        inputSchema: {
            type: 'object',
            properties: {
                command: {
                    type: 'string',
                    description: 'The command to execute',
                },
                cwd: {
                    type: 'string',
                    description: 'Current working directory (optional)',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (default: 10000)',
                },
            },
            required: ['command'],
        },
    },
];

/**
 * Execute a shell command
 */
async function systemShell(options: { command: string; cwd?: string; timeout?: number }): Promise<{ success: boolean; stdout?: string; stderr?: string; error?: string }> {
    try {
        const { stdout, stderr } = await exec(options.command, {
            cwd: options.cwd || process.cwd(),
            timeout: options.timeout || 10000,
        });
        return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || String(error),
            stdout: error.stdout?.toString(),
            stderr: error.stderr?.toString(),
        };
    }
}

/**
 * Handle tool calls (for MCP server integration)
 */
export async function handleSystemToolCall(
    name: string,
    args: Record<string, any>
): Promise<any> {
    switch (name) {
        case 'system_screenshot':
            return systemScreenshot(args as SystemScreenshotOptions);

        case 'system_mouse':
            return systemMouse(args as SystemMouseOptions);

        case 'system_keyboard':
            return systemKeyboard(args as SystemKeyboardOptions);

        case 'system_shell':
            return systemShell(args as { command: string; cwd?: string; timeout?: number });

        case 'system_window_list':
            return { success: true, windows: await listWindows() };

        case 'system_window_focus':
            return focusWindow(args.window);

        case 'system_window_bounds':
            const bounds = await getWindowBounds(args.windowName);
            return bounds
                ? { success: true, bounds }
                : { success: false, error: `Window not found: ${args.windowName}` };

        case 'system_platform_info':
            return { success: true, platform: await detectPlatform() };

        default:
            return { success: false, error: `Unknown tool: ${name}` };
    }
}
