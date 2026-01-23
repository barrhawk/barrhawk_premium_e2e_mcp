/**
 * Example Tool: hello_world
 *
 * A simple example tool to demonstrate the dynamic tool system.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'hello_world',
  description: 'A simple greeting tool that demonstrates dynamic tool creation',

  schema: {
    type: 'object',
    description: 'Greet someone by name',
    properties: {
      name: {
        type: 'string',
        description: 'Name to greet',
        default: 'World',
      },
      excited: {
        type: 'boolean',
        description: 'Use exclamation marks',
        default: false,
      },
    },
  },

  async handler(args) {
    const name = (args.name as string) || 'World';
    const excited = args.excited as boolean;

    const greeting = `Hello, ${name}${excited ? '!!!' : '.'}`;

    return {
      greeting,
      timestamp: new Date().toISOString(),
    };
  },
};
