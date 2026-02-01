/**
 * Filesystem Tools
 * 
 * Allows the MCP server to read and write files, effectively giving it "Hands" 
 * to modify the Triplicate architecture and other projects.
 */

import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// Security: basic path sanitization to prevent breaking out of common sense bounds
// (Though as a local dev tool, it runs with user perms)
function sanitizePath(p: string): string {
    return path.resolve(p);
}

export const filesystemToolDefinitions = [
    {
        name: 'fs_read_file',
        description: 'Read the contents of a file (utf-8).',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute or relative path to the file' }
            },
            required: ['path']
        }
    },
    {
        name: 'fs_write_file',
        description: 'Write content to a file. Creates directories if they don\'t exist. Overwrites by default.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute or relative path to the file' },
                content: { type: 'string', description: 'Text content to write' }
            },
            required: ['path', 'content']
        }
    },
    {
        name: 'fs_list_dir',
        description: 'List contents of a directory.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to directory' }
            },
            required: ['path']
        }
    },
    {
        name: 'fs_file_exists',
        description: 'Check if a file or directory exists.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Path to check' }
            },
            required: ['path']
        }
    }
];

export async function handleFilesystemToolCall(name: string, args: Record<string, any>): Promise<any> {
    const targetPath = sanitizePath(args.path);

    switch (name) {
        case 'fs_read_file': {
            try {
                const content = await readFile(targetPath, 'utf-8');
                return { content };
            } catch (error: any) {
                return { error: `Failed to read file: ${error.message}` };
            }
        }

        case 'fs_write_file': {
            try {
                // Ensure directory exists
                const dir = path.dirname(targetPath);
                if (!existsSync(dir)) {
                    await mkdir(dir, { recursive: true });
                }
                await writeFile(targetPath, args.content, 'utf-8');
                return { success: true, path: targetPath };
            } catch (error: any) {
                return { error: `Failed to write file: ${error.message}` };
            }
        }

        case 'fs_list_dir': {
            try {
                const items = await readdir(targetPath, { withFileTypes: true });
                const result = items.map(item => ({
                    name: item.name,
                    type: item.isDirectory() ? 'directory' : 'file'
                }));
                return { items: result };
            } catch (error: any) {
                return { error: `Failed to list directory: ${error.message}` };
            }
        }

        case 'fs_file_exists': {
            return { exists: existsSync(targetPath) };
        }

        default:
            throw new Error(`Unknown filesystem tool: ${name}`);
    }
}
