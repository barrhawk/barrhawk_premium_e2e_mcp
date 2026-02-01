/**
 * Scribe Protocol Tools
 *
 * Implements the "Scribe Protocol v2.0" for enforcing standardized
 * archival structure for non-root agents ("Plebs").
 *
 * @see scribeprotocol.md
 */

import { mkdir, writeFile, access } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';

const ARCHIVE_ROOT = 'archive';

export interface ScribeInitOptions {
    username: string;
    project: string;
}

export interface ScribeInitResult {
    success: boolean;
    paths: {
        root: string;
        glossary: string;
        research: string;
    };
    message: string;
}

/**
 * Initialize a Scribe container for an agent.
 * Enforces the creation of exactly two files: glossary.md and research.md.
 */
export async function initScribe(options: ScribeInitOptions): Promise<ScribeInitResult> {
    const { username, project } = options;

    // 1. Sanitize inputs to prevent directory traversal
    const safeUser = username.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeProject = project.replace(/[^a-zA-Z0-9_-]/g, '');

    if (!safeUser || !safeProject) {
        throw new Error('Invalid username or project name. Use alphanumeric characters only.');
    }

    const containerPath = path.join(ARCHIVE_ROOT, safeUser, safeProject);

    // 2. Create Directory
    try {
        await mkdir(containerPath, { recursive: true });
    } catch (error: any) {
        return {
            success: false,
            paths: { root: '', glossary: '', research: '' },
            message: `Failed to create container: ${error.message}`
        };
    }

    // 3. Define Standard Files
    const glossaryPath = path.join(containerPath, 'glossary.md');
    const researchPath = path.join(containerPath, 'research.md');

    // 4. Create Glossary if missing
    if (!(await fileExists(glossaryPath))) {
        await writeFile(glossaryPath, `# Glossary: ${safeProject}\n\n## Terms\n\n## Entities\n`);
    }

    // 5. Create Research if missing
    if (!(await fileExists(researchPath))) {
        await writeFile(researchPath, `# Research: ${safeProject}\n\n**Started:** ${new Date().toISOString()}\n\n## Data Stream\n`);
    }

    return {
        success: true,
        paths: {
            root: containerPath,
            glossary: glossaryPath,
            research: researchPath
        },
        message: `Scribe container initialized. You are restricted to: ${glossaryPath} and ${researchPath}`
    };
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Tool Definition for MCP
 */
export const scribeToolDefinitions = [
    {
        name: 'scribe_init',
        description: 'Initialize your standard Scribe Protocol container. Creates glossary.md and research.md in your dedicated archive slot.',
        inputSchema: {
            type: 'object',
            properties: {
                username: {
                    type: 'string',
                    description: 'Your agent username (alphanumeric)',
                },
                project: {
                    type: 'string',
                    description: 'The project title you are working on (alphanumeric)',
                },
            },
            required: ['username', 'project'],
        },
    }
];

export async function handleScribeToolCall(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
        case 'scribe_init':
            return initScribe(args as ScribeInitOptions);
        default:
            throw new Error(`Unknown Scribe tool: ${name}`);
    }
}
