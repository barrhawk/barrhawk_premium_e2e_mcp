/**
 * BarrHawk E2E Session Replay
 *
 * Records test sessions and generates video replays with synchronized
 * logs, network requests, and console output.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir, readdir, unlink, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { LogEntry, NetworkRecord, ScreenshotRecord } from '../observability/store.js';

const execAsync = promisify(exec);

// =============================================================================
// Types
// =============================================================================

export interface ReplayFrame {
  timestamp: Date;
  screenshotPath: string;
  logs: LogEntry[];
  networkRequests: NetworkRecord[];
  activeStep?: string;
  pageUrl?: string;
}

export interface ReplaySession {
  runId: string;
  startTime: Date;
  endTime?: Date;
  frames: ReplayFrame[];
  metadata: {
    testName?: string;
    status?: 'passed' | 'failed' | 'running';
    browser?: string;
    viewport?: { width: number; height: number };
  };
}

export interface ReplayConfig {
  /** Directory for replay output */
  outputDir: string;
  /** Frames per second for video (default: 2) */
  fps: number;
  /** Include log overlay (default: true) */
  showLogs: boolean;
  /** Include network waterfall (default: true) */
  showNetwork: boolean;
  /** Include timestamp overlay (default: true) */
  showTimestamp: boolean;
  /** Video quality (crf value, lower = better, default: 23) */
  quality: number;
  /** Max log lines to show (default: 5) */
  maxLogLines: number;
}

export interface ReplayVideoResult {
  videoPath: string;
  duration: number;
  frameCount: number;
  fileSize: number;
}

// =============================================================================
// Session Recorder
// =============================================================================

export class SessionRecorder {
  private runId: string;
  private frames: ReplayFrame[] = [];
  private startTime: Date;
  private metadata: ReplaySession['metadata'] = {};
  private outputDir: string;
  private frameCounter = 0;

  constructor(runId: string, outputDir: string = './replays') {
    this.runId = runId;
    this.outputDir = outputDir;
    this.startTime = new Date();
  }

  async initialize(): Promise<void> {
    const sessionDir = path.join(this.outputDir, this.runId);
    await mkdir(path.join(sessionDir, 'frames'), { recursive: true });
  }

  setMetadata(metadata: Partial<ReplaySession['metadata']>): void {
    Object.assign(this.metadata, metadata);
  }

  /**
   * Add a frame to the replay
   */
  async addFrame(
    screenshotPath: string,
    logs: LogEntry[] = [],
    networkRequests: NetworkRecord[] = [],
    options: { activeStep?: string; pageUrl?: string } = {}
  ): Promise<void> {
    // Copy screenshot to session directory
    const frameNum = String(this.frameCounter++).padStart(5, '0');
    const framePath = path.join(this.outputDir, this.runId, 'frames', `frame_${frameNum}.png`);

    if (existsSync(screenshotPath)) {
      await copyFile(screenshotPath, framePath);
    }

    this.frames.push({
      timestamp: new Date(),
      screenshotPath: framePath,
      logs: [...logs],
      networkRequests: [...networkRequests],
      ...options,
    });
  }

  /**
   * Get the current session data
   */
  getSession(): ReplaySession {
    return {
      runId: this.runId,
      startTime: this.startTime,
      endTime: this.frames.length > 0 ? this.frames[this.frames.length - 1].timestamp : undefined,
      frames: this.frames,
      metadata: this.metadata,
    };
  }

  /**
   * Save session data to disk
   */
  async saveSession(): Promise<void> {
    const sessionPath = path.join(this.outputDir, this.runId, 'session.json');
    const session = this.getSession();
    await writeFile(sessionPath, JSON.stringify(session, null, 2));
  }
}

// =============================================================================
// Video Generator
// =============================================================================

export class ReplayVideoGenerator {
  private config: Required<ReplayConfig>;

  constructor(config: Partial<ReplayConfig> = {}) {
    this.config = {
      outputDir: './replays',
      fps: 2,
      showLogs: true,
      showNetwork: true,
      showTimestamp: true,
      quality: 23,
      maxLogLines: 5,
      ...config,
    };
  }

  /**
   * Generate video from a recorded session
   */
  async generateVideo(session: ReplaySession): Promise<ReplayVideoResult> {
    const sessionDir = path.join(this.config.outputDir, session.runId);
    const framesDir = path.join(sessionDir, 'frames');
    const videoPath = path.join(sessionDir, `replay_${session.runId}.mp4`);

    // Check if ffmpeg is available
    try {
      await execAsync('ffmpeg -version');
    } catch {
      throw new Error('ffmpeg not found. Please install ffmpeg to generate videos.');
    }

    // Check if we have frames
    if (session.frames.length === 0) {
      throw new Error('No frames to generate video from');
    }

    // Generate video with ffmpeg
    const ffmpegCmd = [
      'ffmpeg -y',
      `-framerate ${this.config.fps}`,
      `-i "${framesDir}/frame_%05d.png"`,
      '-c:v libx264',
      '-pix_fmt yuv420p',
      `-crf ${this.config.quality}`,
      `-vf "scale=trunc(iw/2)*2:trunc(ih/2)*2"`, // Ensure even dimensions
      `"${videoPath}"`,
    ].join(' ');

    try {
      await execAsync(ffmpegCmd);
    } catch (error) {
      throw new Error(`Failed to generate video: ${error}`);
    }

    // Get file size
    const stats = await import('fs').then(fs => fs.promises.stat(videoPath));

    return {
      videoPath,
      duration: session.frames.length / this.config.fps,
      frameCount: session.frames.length,
      fileSize: stats.size,
    };
  }

  /**
   * Generate an HTML replay player with timeline, logs, and network
   */
  async generateHtmlPlayer(session: ReplaySession): Promise<string> {
    const sessionDir = path.join(this.config.outputDir, session.runId);
    const playerPath = path.join(sessionDir, 'player.html');

    const framesJson = JSON.stringify(session.frames.map((f, i) => ({
      index: i,
      timestamp: f.timestamp,
      screenshot: `frames/frame_${String(i).padStart(5, '0')}.png`,
      logs: f.logs.slice(0, this.config.maxLogLines),
      network: f.networkRequests.slice(0, 10),
      step: f.activeStep,
      url: f.pageUrl,
    })));

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Session Replay - ${session.runId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'SF Mono', Monaco, monospace;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 0;
      border-bottom: 1px solid #334155;
      margin-bottom: 20px;
    }
    h1 { font-size: 1.25rem; color: #3b82f6; }
    .status { padding: 4px 12px; border-radius: 4px; font-size: 0.8rem; }
    .status-passed { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
    .status-failed { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

    .main-content { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }

    .player-section { background: #1e293b; border-radius: 8px; overflow: hidden; }
    .screenshot-container {
      position: relative;
      background: #000;
      aspect-ratio: 16/10;
    }
    .screenshot-container img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      padding: 20px;
    }
    .timestamp { font-size: 0.75rem; color: #94a3b8; }
    .step-indicator { font-size: 0.9rem; color: #22c55e; margin-top: 5px; }

    .controls {
      display: flex;
      align-items: center;
      gap: 15px;
      padding: 15px;
      background: #334155;
    }
    .controls button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 8px 20px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
    }
    .controls button:hover { background: #2563eb; }
    .timeline {
      flex: 1;
      height: 6px;
      background: #475569;
      border-radius: 3px;
      cursor: pointer;
    }
    .timeline-progress {
      height: 100%;
      background: #3b82f6;
      border-radius: 3px;
      width: 0%;
      transition: width 0.1s;
    }
    .speed-control { display: flex; gap: 5px; }
    .speed-control button {
      background: #475569;
      padding: 4px 8px;
      font-size: 0.75rem;
    }
    .speed-control button.active { background: #3b82f6; }

    .sidebar { display: flex; flex-direction: column; gap: 15px; }
    .panel {
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-header {
      padding: 12px 15px;
      background: #334155;
      font-weight: bold;
      font-size: 0.85rem;
    }
    .panel-content {
      padding: 10px;
      max-height: 250px;
      overflow-y: auto;
    }

    .log-entry {
      padding: 6px 10px;
      border-bottom: 1px solid #334155;
      font-size: 0.75rem;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: #64748b; margin-right: 8px; }
    .log-error { color: #ef4444; }
    .log-warn { color: #eab308; }
    .log-info { color: #3b82f6; }

    .network-entry {
      display: flex;
      justify-content: space-between;
      padding: 6px 10px;
      border-bottom: 1px solid #334155;
      font-size: 0.75rem;
    }
    .network-method { font-weight: bold; color: #22c55e; width: 50px; }
    .network-url { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94a3b8; }
    .network-status { width: 40px; text-align: right; }
    .status-ok { color: #22c55e; }
    .status-error { color: #ef4444; }

    .frame-indicator { font-size: 0.8rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Session Replay</h1>
      <div>
        <span class="status status-${session.metadata.status || 'passed'}">${(session.metadata.status || 'passed').toUpperCase()}</span>
      </div>
    </header>

    <div class="main-content">
      <div class="player-section">
        <div class="screenshot-container">
          <img id="screenshot" src="" alt="Screenshot">
          <div class="overlay">
            <div class="timestamp" id="timestamp"></div>
            <div class="step-indicator" id="step"></div>
          </div>
        </div>
        <div class="controls">
          <button id="playPause">Play</button>
          <button id="prevFrame">←</button>
          <button id="nextFrame">→</button>
          <div class="timeline" id="timeline">
            <div class="timeline-progress" id="progress"></div>
          </div>
          <div class="speed-control">
            <button data-speed="0.5">0.5x</button>
            <button data-speed="1" class="active">1x</button>
            <button data-speed="2">2x</button>
          </div>
          <span class="frame-indicator"><span id="currentFrame">0</span> / <span id="totalFrames">0</span></span>
        </div>
      </div>

      <div class="sidebar">
        <div class="panel">
          <div class="panel-header">Console Logs</div>
          <div class="panel-content" id="logs"></div>
        </div>
        <div class="panel">
          <div class="panel-header">Network Requests</div>
          <div class="panel-content" id="network"></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const frames = ${framesJson};
    let currentFrameIndex = 0;
    let isPlaying = false;
    let playbackSpeed = 1;
    let playInterval = null;

    const screenshot = document.getElementById('screenshot');
    const timestamp = document.getElementById('timestamp');
    const step = document.getElementById('step');
    const progress = document.getElementById('progress');
    const currentFrameEl = document.getElementById('currentFrame');
    const totalFramesEl = document.getElementById('totalFrames');
    const logsPanel = document.getElementById('logs');
    const networkPanel = document.getElementById('network');
    const playPauseBtn = document.getElementById('playPause');

    totalFramesEl.textContent = frames.length;

    function updateFrame(index) {
      if (index < 0 || index >= frames.length) return;
      currentFrameIndex = index;
      const frame = frames[index];

      screenshot.src = frame.screenshot;
      timestamp.textContent = new Date(frame.timestamp).toISOString().substring(11, 23);
      step.textContent = frame.step || frame.url || '';
      progress.style.width = ((index + 1) / frames.length * 100) + '%';
      currentFrameEl.textContent = index + 1;

      // Update logs
      logsPanel.innerHTML = frame.logs.map(log => {
        const levelClass = log.level === 'error' ? 'log-error' :
                          log.level === 'warn' ? 'log-warn' :
                          log.level === 'info' ? 'log-info' : '';
        const time = new Date(log.timestamp).toISOString().substring(11, 19);
        return '<div class="log-entry ' + levelClass + '">' +
               '<span class="log-time">' + time + '</span>' +
               log.message.substring(0, 80) +
               '</div>';
      }).join('');

      // Update network
      networkPanel.innerHTML = frame.network.map(req => {
        const statusClass = req.status && req.status < 400 ? 'status-ok' : 'status-error';
        return '<div class="network-entry">' +
               '<span class="network-method">' + req.method + '</span>' +
               '<span class="network-url" title="' + req.url + '">' + req.url.substring(0, 40) + '</span>' +
               '<span class="network-status ' + statusClass + '">' + (req.status || '-') + '</span>' +
               '</div>';
      }).join('');
    }

    function play() {
      if (playInterval) clearInterval(playInterval);
      isPlaying = true;
      playPauseBtn.textContent = 'Pause';
      playInterval = setInterval(() => {
        if (currentFrameIndex < frames.length - 1) {
          updateFrame(currentFrameIndex + 1);
        } else {
          pause();
        }
      }, 1000 / ${this.config.fps} / playbackSpeed);
    }

    function pause() {
      if (playInterval) clearInterval(playInterval);
      isPlaying = false;
      playPauseBtn.textContent = 'Play';
    }

    playPauseBtn.addEventListener('click', () => isPlaying ? pause() : play());
    document.getElementById('prevFrame').addEventListener('click', () => { pause(); updateFrame(currentFrameIndex - 1); });
    document.getElementById('nextFrame').addEventListener('click', () => { pause(); updateFrame(currentFrameIndex + 1); });

    document.getElementById('timeline').addEventListener('click', (e) => {
      const rect = e.target.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      updateFrame(Math.floor(percent * frames.length));
    });

    document.querySelectorAll('.speed-control button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.speed-control button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        playbackSpeed = parseFloat(btn.dataset.speed);
        if (isPlaying) { pause(); play(); }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); isPlaying ? pause() : play(); }
      if (e.code === 'ArrowLeft') { pause(); updateFrame(currentFrameIndex - 1); }
      if (e.code === 'ArrowRight') { pause(); updateFrame(currentFrameIndex + 1); }
    });

    // Initialize
    if (frames.length > 0) updateFrame(0);
  </script>
</body>
</html>`;

    await writeFile(playerPath, html);
    return playerPath;
  }

  /**
   * Load a session from disk
   */
  async loadSession(runId: string): Promise<ReplaySession | null> {
    const sessionPath = path.join(this.config.outputDir, runId, 'session.json');
    if (!existsSync(sessionPath)) {
      return null;
    }

    try {
      const data = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(data);
      session.startTime = new Date(session.startTime);
      if (session.endTime) session.endTime = new Date(session.endTime);
      session.frames = session.frames.map((f: any) => ({
        ...f,
        timestamp: new Date(f.timestamp),
        logs: f.logs.map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) })),
        networkRequests: f.networkRequests.map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) })),
      }));
      return session;
    } catch {
      return null;
    }
  }

  /**
   * List all available replay sessions
   */
  async listSessions(): Promise<Array<{ runId: string; startTime: Date; frameCount: number; status?: string }>> {
    if (!existsSync(this.config.outputDir)) {
      return [];
    }

    const entries = await readdir(this.config.outputDir, { withFileTypes: true });
    const sessions: Array<{ runId: string; startTime: Date; frameCount: number; status?: string }> = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const session = await this.loadSession(entry.name);
        if (session) {
          sessions.push({
            runId: session.runId,
            startTime: session.startTime,
            frameCount: session.frames.length,
            status: session.metadata.status,
          });
        }
      }
    }

    return sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

export async function createReplaySession(runId: string, outputDir?: string): Promise<SessionRecorder> {
  const recorder = new SessionRecorder(runId, outputDir);
  await recorder.initialize();
  return recorder;
}

export async function generateReplayVideo(
  runId: string,
  config?: Partial<ReplayConfig>
): Promise<ReplayVideoResult> {
  const generator = new ReplayVideoGenerator(config);
  const session = await generator.loadSession(runId);
  if (!session) {
    throw new Error(`Session not found: ${runId}`);
  }
  return generator.generateVideo(session);
}

export async function generateReplayPlayer(
  runId: string,
  config?: Partial<ReplayConfig>
): Promise<string> {
  const generator = new ReplayVideoGenerator(config);
  const session = await generator.loadSession(runId);
  if (!session) {
    throw new Error(`Session not found: ${runId}`);
  }
  return generator.generateHtmlPlayer(session);
}
