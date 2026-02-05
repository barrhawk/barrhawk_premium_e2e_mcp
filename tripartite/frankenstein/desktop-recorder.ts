/**
 * DESKTOP RECORDER - Full screen recording for E2E testing
 *
 * Provides:
 * - Desktop screen recording via ffmpeg (X11) or wf-recorder (Wayland)
 * - Headless recording via Xvfb virtual framebuffer
 * - Session management with timestamps and metadata
 *
 * This decouples recording from browser automation - records EVERYTHING
 * visible on screen, not just the browser viewport.
 */

import { createLogger } from '../shared/logger.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';

const logger = createLogger({
  component: 'desktop-recorder',
  version: '1.0.0',
  minLevel: 'INFO',
  pretty: true,
});

// =============================================================================
// Types
// =============================================================================

export interface RecordingSession {
  id: string;
  startTime: number;
  endTime?: number;
  outputPath: string;
  format: 'mp4' | 'webm' | 'mkv';
  resolution?: { width: number; height: number };
  fps: number;
  tool: 'ffmpeg' | 'wf-recorder';
  display?: string;
  pid?: number;
  status: 'recording' | 'stopped' | 'error';
  error?: string;
  metadata?: Record<string, any>;
}

export interface RecordingOptions {
  outputDir?: string;
  filename?: string;
  format?: 'mp4' | 'webm' | 'mkv';
  fps?: number;
  resolution?: { width: number; height: number };
  display?: string;  // X11 display (e.g., ':0', ':99')
  audio?: boolean;
  metadata?: Record<string, any>;
}

export interface HeadlessSession {
  id: string;
  display: string;
  resolution: { width: number; height: number };
  pid: number;
  startTime: number;
  status: 'running' | 'stopped' | 'error';
}

// =============================================================================
// State
// =============================================================================

let currentRecording: RecordingSession | null = null;
let recordingProcess: any = null;
let currentHeadless: HeadlessSession | null = null;
let xvfbProcess: any = null;

// =============================================================================
// Tool Detection
// =============================================================================

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', cmd], { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function detectRecordingTool(): Promise<'ffmpeg' | 'wf-recorder' | null> {
  const sessionType = process.env.XDG_SESSION_TYPE || '';

  if (sessionType === 'wayland') {
    if (await commandExists('wf-recorder')) return 'wf-recorder';
  }

  if (await commandExists('ffmpeg')) return 'ffmpeg';
  if (await commandExists('wf-recorder')) return 'wf-recorder';

  return null;
}

async function detectDisplay(): Promise<string> {
  // Check for Xvfb/headless display first
  if (currentHeadless?.display) return currentHeadless.display;

  // Check DISPLAY env var
  if (process.env.DISPLAY) return process.env.DISPLAY;

  // Default
  return ':0';
}

// =============================================================================
// Desktop Recording
// =============================================================================

export async function startDesktopRecording(options: RecordingOptions = {}): Promise<RecordingSession> {
  if (currentRecording?.status === 'recording') {
    throw new Error('Recording already in progress. Stop it first.');
  }

  const tool = await detectRecordingTool();
  if (!tool) {
    throw new Error('No recording tool available. Install ffmpeg or wf-recorder.');
  }

  const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outputDir = options.outputDir || '/tmp/barrhawk-recordings';
  const format = options.format || 'mp4';
  const fps = options.fps || 30;
  const display = options.display || await detectDisplay();
  const filename = options.filename || `recording_${id}`;
  const outputPath = path.join(outputDir, `${filename}.${format}`);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  logger.info(`Starting desktop recording: ${outputPath}`);
  logger.info(`Using tool: ${tool}, display: ${display}, fps: ${fps}`);

  let proc: any;
  let args: string[];

  if (tool === 'ffmpeg') {
    // FFmpeg for X11
    args = [
      '-y',  // Overwrite output
      '-f', 'x11grab',
      '-framerate', fps.toString(),
      '-i', display,
    ];

    // Add resolution if specified
    if (options.resolution) {
      args.push('-video_size', `${options.resolution.width}x${options.resolution.height}`);
    }

    // Audio capture (optional)
    if (options.audio) {
      args.push('-f', 'pulse', '-i', 'default');
    }

    // Output encoding
    if (format === 'mp4') {
      args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23');
    } else if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0');
    }

    args.push(outputPath);

    proc = Bun.spawn(['ffmpeg', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

  } else if (tool === 'wf-recorder') {
    // wf-recorder for Wayland
    args = [
      '-f', outputPath,
      '--codec', format === 'mp4' ? 'libx264' : 'libvpx',
    ];

    if (options.audio) {
      args.push('-a');
    }

    proc = Bun.spawn(['wf-recorder', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  recordingProcess = proc;

  currentRecording = {
    id,
    startTime: Date.now(),
    outputPath,
    format,
    resolution: options.resolution,
    fps,
    tool,
    display,
    pid: proc?.pid,
    status: 'recording',
    metadata: options.metadata,
  };

  // Save session info
  const sessionFile = path.join(outputDir, `${id}.json`);
  writeFileSync(sessionFile, JSON.stringify(currentRecording, null, 2));

  logger.info(`Recording started: ${id} (PID: ${proc?.pid})`);
  return currentRecording;
}

export async function stopDesktopRecording(): Promise<RecordingSession> {
  if (!currentRecording || currentRecording.status !== 'recording') {
    throw new Error('No active recording to stop.');
  }

  logger.info(`Stopping recording: ${currentRecording.id}`);

  try {
    if (recordingProcess) {
      // Send SIGINT for graceful shutdown (allows ffmpeg to finalize the file)
      recordingProcess.kill('SIGINT');

      // Wait for process to exit (with timeout)
      const timeout = setTimeout(() => {
        if (recordingProcess) {
          recordingProcess.kill('SIGKILL');
        }
      }, 5000);

      await recordingProcess.exited;
      clearTimeout(timeout);
    }

    currentRecording.endTime = Date.now();
    currentRecording.status = 'stopped';

    // Update session file
    const sessionFile = currentRecording.outputPath.replace(/\.[^.]+$/, '.json');
    if (existsSync(sessionFile.replace(/\.json$/, '') + '.json')) {
      writeFileSync(
        currentRecording.outputPath.replace(/\.[^.]+$/, '.json'),
        JSON.stringify(currentRecording, null, 2)
      );
    }

    logger.info(`Recording stopped. Duration: ${(currentRecording.endTime - currentRecording.startTime) / 1000}s`);
    logger.info(`Output: ${currentRecording.outputPath}`);

    const result = { ...currentRecording };
    recordingProcess = null;
    currentRecording = null;

    return result;

  } catch (error: any) {
    currentRecording.status = 'error';
    currentRecording.error = error.message;
    throw error;
  }
}

export function getRecordingStatus(): RecordingSession | null {
  if (!currentRecording) return null;

  return {
    ...currentRecording,
    duration: currentRecording.status === 'recording'
      ? Date.now() - currentRecording.startTime
      : (currentRecording.endTime || 0) - currentRecording.startTime,
  } as RecordingSession & { duration: number };
}

// =============================================================================
// Headless Display (Xvfb)
// =============================================================================

export async function startHeadlessDisplay(options: {
  display?: string;
  resolution?: { width: number; height: number };
} = {}): Promise<HeadlessSession> {
  if (currentHeadless?.status === 'running') {
    throw new Error('Headless display already running. Stop it first.');
  }

  if (!(await commandExists('Xvfb'))) {
    throw new Error('Xvfb not installed. Install with: sudo dnf install xorg-x11-server-Xvfb');
  }

  const display = options.display || ':99';
  const resolution = options.resolution || { width: 1920, height: 1080 };
  const id = `xvfb_${Date.now()}`;

  logger.info(`Starting headless display: ${display} (${resolution.width}x${resolution.height})`);

  const proc = Bun.spawn([
    'Xvfb',
    display,
    '-screen', '0', `${resolution.width}x${resolution.height}x24`,
    '-ac',  // Disable access control
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  xvfbProcess = proc;

  // Wait a moment for Xvfb to start
  await new Promise(r => setTimeout(r, 500));

  // Verify it's running
  if (proc.exitCode !== null) {
    throw new Error('Xvfb failed to start');
  }

  currentHeadless = {
    id,
    display,
    resolution,
    pid: proc.pid!,
    startTime: Date.now(),
    status: 'running',
  };

  // Set DISPLAY environment variable for child processes
  process.env.DISPLAY = display;

  logger.info(`Headless display started: ${display} (PID: ${proc.pid})`);
  return currentHeadless;
}

export async function stopHeadlessDisplay(): Promise<HeadlessSession> {
  if (!currentHeadless || currentHeadless.status !== 'running') {
    throw new Error('No active headless display to stop.');
  }

  logger.info(`Stopping headless display: ${currentHeadless.display}`);

  try {
    if (xvfbProcess) {
      xvfbProcess.kill('SIGTERM');
      await xvfbProcess.exited;
    }

    currentHeadless.status = 'stopped';

    // Reset DISPLAY if we set it
    if (process.env.DISPLAY === currentHeadless.display) {
      delete process.env.DISPLAY;
    }

    const result = { ...currentHeadless };
    xvfbProcess = null;
    currentHeadless = null;

    logger.info('Headless display stopped');
    return result;

  } catch (error: any) {
    currentHeadless.status = 'error';
    throw error;
  }
}

export function getHeadlessStatus(): HeadlessSession | null {
  return currentHeadless;
}

// =============================================================================
// Combined Headless Recording Session
// =============================================================================

export interface HeadlessRecordingSession {
  headless: HeadlessSession;
  recording: RecordingSession;
}

export async function startHeadlessRecording(options: {
  display?: string;
  resolution?: { width: number; height: number };
  outputDir?: string;
  filename?: string;
  format?: 'mp4' | 'webm' | 'mkv';
  fps?: number;
} = {}): Promise<HeadlessRecordingSession> {
  // Start virtual display
  const headless = await startHeadlessDisplay({
    display: options.display,
    resolution: options.resolution,
  });

  // Start recording on that display
  const recording = await startDesktopRecording({
    outputDir: options.outputDir,
    filename: options.filename,
    format: options.format,
    fps: options.fps,
    display: headless.display,
    resolution: options.resolution,
  });

  return { headless, recording };
}

export async function stopHeadlessRecording(): Promise<HeadlessRecordingSession> {
  const recording = await stopDesktopRecording();
  const headless = await stopHeadlessDisplay();
  return { headless, recording };
}

// =============================================================================
// Cleanup on exit
// =============================================================================

const cleanup = async () => {
  if (currentRecording?.status === 'recording') {
    try {
      await stopDesktopRecording();
    } catch {}
  }
  if (currentHeadless?.status === 'running') {
    try {
      await stopHeadlessDisplay();
    } catch {}
  }
};

process.on('exit', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
