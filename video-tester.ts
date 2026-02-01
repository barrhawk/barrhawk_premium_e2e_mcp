/**
 * BarrHawk Video Tester
 *
 * Two modes:
 * 1. Video Analysis - Uses Gemini to analyze test recordings against protocols
 * 2. Wes Anderson Mode - Creates cinematic films from E2E test screenshots
 */

import { spawn } from 'child_process';
import { writeFile, readFile, mkdir, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Video output directory
const VIDEO_DIR = path.join(process.cwd(), 'test-videos');
const FRAMES_DIR = path.join(VIDEO_DIR, 'frames');
const FILMS_DIR = path.join(VIDEO_DIR, 'films');

// Wes Anderson color palettes
const WES_PALETTES = {
    grandBudapest: ['#F1BB7B', '#FD6467', '#5B1A18', '#D67236', '#E6A0C4'],
    moonriseKingdom: ['#85D4E3', '#F4B5BD', '#9C964A', '#CDC08C', '#FAD77B'],
    royalTenenbaums: ['#899DA4', '#C93312', '#FAEFD1', '#DC863B', '#9A8822'],
    lifeAquatic: ['#E6A0C4', '#C6CDF7', '#D8A499', '#7294D4', '#E4E1E3'],
    fantasticMrFox: ['#F2AD00', '#F98400', '#5BBCD6', '#00A08A', '#FF0000'],
};

// Gemini API integration
interface GeminiConfig {
    apiKey?: string;
    model?: string;
}

let geminiApiKey: string | null = null;

function getGeminiApiKey(): string {
    if (!geminiApiKey) {
        geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
        if (!geminiApiKey) {
            throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable required');
        }
    }
    return geminiApiKey;
}

// Screenshot collector for Wes Anderson mode
interface ScreenshotFrame {
    path: string;
    timestamp: number;
    title?: string;
    subtitle?: string;
}

interface WesAndersonSession {
    id: string;
    palette: keyof typeof WES_PALETTES;
    frames: ScreenshotFrame[];
    startTime: number;
    title: string;
    music?: string;
}

const activeSessions: Map<string, WesAndersonSession> = new Map();

/**
 * Analyze a video using Gemini's native video understanding
 */
export async function analyzeVideo(args: {
    videoPath?: string;
    videoUrl?: string;
    testProtocol: string;
    analysisType?: 'full' | 'summary' | 'issues_only';
}): Promise<{
    success: boolean;
    analysis?: {
        summary: string;
        protocolCompliance: number;
        issues: Array<{ timestamp: string; description: string; severity: 'low' | 'medium' | 'high' }>;
        recommendations: string[];
        testSteps: Array<{ step: string; status: 'pass' | 'fail' | 'unclear'; timestamp: string }>;
    };
    error?: string;
}> {
    const apiKey = getGeminiApiKey();
    const model = 'gemini-2.0-flash';

    try {
        let videoData: string | null = null;
        let mimeType = 'video/mp4';

        if (args.videoPath) {
            // Read video file and convert to base64
            const videoBuffer = await readFile(args.videoPath);
            videoData = videoBuffer.toString('base64');

            // Detect mime type from extension
            const ext = path.extname(args.videoPath).toLowerCase();
            const mimeTypes: Record<string, string> = {
                '.mp4': 'video/mp4',
                '.webm': 'video/webm',
                '.mov': 'video/quicktime',
                '.avi': 'video/x-msvideo',
            };
            mimeType = mimeTypes[ext] || 'video/mp4';
        }

        const prompt = `You are a QA testing expert analyzing a software test recording.

TEST PROTOCOL:
${args.testProtocol}

ANALYSIS TYPE: ${args.analysisType || 'full'}

Analyze this video of a software test and provide:
1. A summary of what happened in the test
2. Protocol compliance score (0-100)
3. Any issues found with timestamps and severity
4. Recommendations for improvement
5. Each test step with pass/fail status and timestamp

Respond in this exact JSON format:
{
    "summary": "...",
    "protocolCompliance": 85,
    "issues": [
        {"timestamp": "0:23", "description": "...", "severity": "medium"}
    ],
    "recommendations": ["..."],
    "testSteps": [
        {"step": "Login", "status": "pass", "timestamp": "0:05"}
    ]
}`;

        const requestBody: any = {
            contents: [{
                parts: [
                    { text: prompt }
                ]
            }]
        };

        // Add video data if we have a file
        if (videoData) {
            requestBody.contents[0].parts.unshift({
                inline_data: {
                    mime_type: mimeType,
                    data: videoData
                }
            });
        } else if (args.videoUrl) {
            // For URLs, use file_data
            requestBody.contents[0].parts.unshift({
                file_data: {
                    file_uri: args.videoUrl,
                    mime_type: mimeType
                }
            });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error('No response from Gemini');
        }

        // Parse JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
        const analysis = JSON.parse(jsonStr);

        return { success: true, analysis };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Upload a video to Gemini Files API for analysis
 */
export async function uploadVideoForAnalysis(args: {
    videoPath: string;
    displayName?: string;
}): Promise<{
    success: boolean;
    fileUri?: string;
    fileName?: string;
    error?: string;
}> {
    const apiKey = getGeminiApiKey();

    try {
        const videoBuffer = await readFile(args.videoPath);
        const ext = path.extname(args.videoPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.mov': 'video/quicktime',
        };
        const mimeType = mimeTypes[ext] || 'video/mp4';

        // Start resumable upload
        const startResponse = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': String(videoBuffer.length),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file: { display_name: args.displayName || path.basename(args.videoPath) }
                })
            }
        );

        const uploadUrl = startResponse.headers.get('X-Goog-Upload-URL');
        if (!uploadUrl) {
            throw new Error('Failed to get upload URL');
        }

        // Upload the video
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Length': String(videoBuffer.length),
                'X-Goog-Upload-Offset': '0',
                'X-Goog-Upload-Command': 'upload, finalize',
            },
            body: videoBuffer
        });

        const fileInfo = await uploadResponse.json();

        return {
            success: true,
            fileUri: fileInfo.file?.uri,
            fileName: fileInfo.file?.name
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Start a Wes Anderson filming session
 */
export async function startWesAndersonSession(args: {
    title: string;
    palette?: keyof typeof WES_PALETTES;
}): Promise<{
    success: boolean;
    sessionId: string;
    message: string;
}> {
    await mkdir(FRAMES_DIR, { recursive: true });
    await mkdir(FILMS_DIR, { recursive: true });

    const sessionId = `wes_${Date.now()}`;
    const palette = args.palette || 'grandBudapest';

    const session: WesAndersonSession = {
        id: sessionId,
        palette,
        frames: [],
        startTime: Date.now(),
        title: args.title,
    };

    activeSessions.set(sessionId, session);

    return {
        success: true,
        sessionId,
        message: `Wes Anderson session started with ${palette} palette. Capture frames with video_capture_frame.`
    };
}

/**
 * Capture a frame for the Wes Anderson film
 */
export async function captureWesAndersonFrame(args: {
    sessionId: string;
    screenshotBase64: string;
    title?: string;
    subtitle?: string;
}): Promise<{
    success: boolean;
    frameNumber: number;
    message: string;
}> {
    const session = activeSessions.get(args.sessionId);
    if (!session) {
        return { success: false, frameNumber: 0, message: 'Session not found' };
    }

    const frameNumber = session.frames.length + 1;
    const framePath = path.join(FRAMES_DIR, `${args.sessionId}_frame_${String(frameNumber).padStart(4, '0')}.png`);

    // Save the screenshot
    const imageBuffer = Buffer.from(args.screenshotBase64, 'base64');
    await writeFile(framePath, imageBuffer);

    session.frames.push({
        path: framePath,
        timestamp: Date.now() - session.startTime,
        title: args.title,
        subtitle: args.subtitle,
    });

    return {
        success: true,
        frameNumber,
        message: `Frame ${frameNumber} captured${args.title ? `: "${args.title}"` : ''}`
    };
}

/**
 * Generate the Wes Anderson film from captured frames
 */
export async function generateWesAndersonFilm(args: {
    sessionId: string;
    fps?: number;
    addTitles?: boolean;
    outputName?: string;
}): Promise<{
    success: boolean;
    videoPath?: string;
    duration?: number;
    frameCount?: number;
    error?: string;
}> {
    const session = activeSessions.get(args.sessionId);
    if (!session) {
        return { success: false, error: 'Session not found' };
    }

    if (session.frames.length === 0) {
        return { success: false, error: 'No frames captured' };
    }

    const fps = args.fps || 2; // Slow, deliberate Wes Anderson pacing
    const outputName = args.outputName || `${session.title.replace(/\s+/g, '_')}_${Date.now()}`;
    const outputPath = path.join(FILMS_DIR, `${outputName}.mp4`);
    const palette = WES_PALETTES[session.palette];
    const primaryColor = palette[0];
    const accentColor = palette[1];

    try {
        // Create a temporary file list for ffmpeg
        const listPath = path.join(FRAMES_DIR, `${args.sessionId}_filelist.txt`);
        const frameDuration = 1 / fps;

        // Build ffmpeg filter for Wes Anderson style
        // - Slight vignette
        // - Centered crop with letterboxing
        // - Color grading toward the palette
        // - Title cards between scenes

        let filterComplex = '';
        const inputs: string[] = [];

        for (let i = 0; i < session.frames.length; i++) {
            const frame = session.frames[i];
            inputs.push('-loop', '1', '-t', String(2), '-i', frame.path);
        }

        // Build filter chain for each frame
        const filterParts: string[] = [];
        for (let i = 0; i < session.frames.length; i++) {
            const frame = session.frames[i];
            // Apply Wes Anderson style: vignette, slight saturation boost, centered framing
            let frameFilter = `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color='${primaryColor}',vignette=PI/4`;

            // Add title overlay if present
            if (args.addTitles !== false && frame.title) {
                const escapedTitle = frame.title.replace(/'/g, "\\'").replace(/:/g, "\\:");
                frameFilter += `,drawtext=text='${escapedTitle}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=h-100:borderw=2:bordercolor=black`;
            }

            filterParts.push(`${frameFilter}[v${i}]`);
        }

        // Concatenate all frames
        const concatInputs = session.frames.map((_, i) => `[v${i}]`).join('');
        filterComplex = filterParts.join(';') + `;${concatInputs}concat=n=${session.frames.length}:v=1:a=0[outv]`;

        // Build ffmpeg command
        const ffmpegArgs = [
            ...inputs,
            '-filter_complex', filterComplex,
            '-map', '[outv]',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-r', String(fps * 2), // Output at double fps for smooth transitions
            '-y',
            outputPath
        ];

        await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', ffmpegArgs);
            let stderr = '';

            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`ffmpeg failed: ${stderr}`));
                }
            });

            ffmpeg.on('error', (err) => {
                reject(err);
            });
        });

        // Cleanup temporary files
        await unlink(listPath).catch(() => {});

        const duration = session.frames.length * 2; // 2 seconds per frame

        // Clean up session
        activeSessions.delete(args.sessionId);

        return {
            success: true,
            videoPath: outputPath,
            duration,
            frameCount: session.frames.length
        };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Generate a title card in Wes Anderson style
 */
export async function generateTitleCard(args: {
    title: string;
    subtitle?: string;
    palette?: keyof typeof WES_PALETTES;
    outputPath?: string;
}): Promise<{
    success: boolean;
    imagePath?: string;
    error?: string;
}> {
    await mkdir(FRAMES_DIR, { recursive: true });

    const palette = WES_PALETTES[args.palette || 'grandBudapest'];
    const bgColor = palette[0];
    const textColor = palette[2];
    const outputPath = args.outputPath || path.join(FRAMES_DIR, `title_${Date.now()}.png`);

    const escapedTitle = args.title.replace(/'/g, "\\'").replace(/:/g, "\\:");
    const escapedSubtitle = args.subtitle?.replace(/'/g, "\\'").replace(/:/g, "\\:") || '';

    // Use ffmpeg to generate a title card
    const ffmpegArgs = [
        '-f', 'lavfi',
        '-i', `color=c='${bgColor}':s=1920x1080:d=1`,
        '-vf', `drawtext=text='${escapedTitle}':fontsize=72:fontcolor='${textColor}':x=(w-text_w)/2:y=(h-text_h)/2-50${
            args.subtitle ? `,drawtext=text='${escapedSubtitle}':fontsize=36:fontcolor='${textColor}':x=(w-text_w)/2:y=(h-text_h)/2+50` : ''
        }`,
        '-frames:v', '1',
        '-y',
        outputPath
    ];

    try {
        await new Promise<void>((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', ffmpegArgs);
            ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
            ffmpeg.on('error', reject);
        });

        return { success: true, imagePath: outputPath };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * List available Wes Anderson palettes
 */
export function listWesPalettes(): {
    palettes: Array<{ name: string; colors: string[]; description: string }>;
} {
    return {
        palettes: [
            { name: 'grandBudapest', colors: WES_PALETTES.grandBudapest, description: 'Pink and coral tones from The Grand Budapest Hotel' },
            { name: 'moonriseKingdom', colors: WES_PALETTES.moonriseKingdom, description: 'Soft pastels and earth tones from Moonrise Kingdom' },
            { name: 'royalTenenbaums', colors: WES_PALETTES.royalTenenbaums, description: 'Muted earth tones from The Royal Tenenbaums' },
            { name: 'lifeAquatic', colors: WES_PALETTES.lifeAquatic, description: 'Ocean blues and soft pinks from The Life Aquatic' },
            { name: 'fantasticMrFox', colors: WES_PALETTES.fantasticMrFox, description: 'Autumn oranges and teals from Fantastic Mr. Fox' },
        ]
    };
}

/**
 * List active Wes Anderson sessions
 */
export function listWesSessions(): {
    sessions: Array<{
        id: string;
        title: string;
        palette: string;
        frameCount: number;
        duration: number;
    }>;
} {
    const sessions = Array.from(activeSessions.values()).map(s => ({
        id: s.id,
        title: s.title,
        palette: s.palette,
        frameCount: s.frames.length,
        duration: Date.now() - s.startTime,
    }));

    return { sessions };
}

/**
 * Quick film generation - takes array of screenshot paths and generates film directly
 */
export async function quickFilm(args: {
    title: string;
    screenshots: string[]; // Array of file paths
    palette?: keyof typeof WES_PALETTES;
    fps?: number;
}): Promise<{
    success: boolean;
    videoPath?: string;
    error?: string;
}> {
    // Start session
    const sessionResult = await startWesAndersonSession({
        title: args.title,
        palette: args.palette,
    });

    if (!sessionResult.success) {
        return { success: false, error: 'Failed to start session' };
    }

    // Add each screenshot as a frame
    for (let i = 0; i < args.screenshots.length; i++) {
        try {
            const imageBuffer = await readFile(args.screenshots[i]);
            const base64 = imageBuffer.toString('base64');

            await captureWesAndersonFrame({
                sessionId: sessionResult.sessionId,
                screenshotBase64: base64,
                title: `Step ${i + 1}`,
            });
        } catch (error) {
            // Skip failed frames
            console.error(`Failed to add frame ${i}:`, error);
        }
    }

    // Generate the film
    return generateWesAndersonFilm({
        sessionId: sessionResult.sessionId,
        fps: args.fps,
        addTitles: true,
    });
}
