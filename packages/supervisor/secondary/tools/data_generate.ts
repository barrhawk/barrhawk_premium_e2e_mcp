/**
 * Dynamic Tool: data_generate
 * Created: 2026-01-23T14:30:10.662Z
 * Permissions: none
 *
 * Generate realistic test data (names, emails, phones, addresses, UUIDs, etc.) using built-in patterns.
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'data_generate',
  description: "Generate realistic test data (names, emails, phones, addresses, UUIDs, etc.) using built-in patterns.",
  schema: {
      "type": "object",
      "properties": {
          "type": {
              "type": "string",
              "enum": [
                  "name",
                  "firstName",
                  "lastName",
                  "email",
                  "phone",
                  "uuid",
                  "date",
                  "boolean",
                  "number",
                  "word",
                  "sentence",
                  "paragraph",
                  "url",
                  "ipv4",
                  "username",
                  "password",
                  "hexColor",
                  "company"
              ],
              "description": "Type of data to generate"
          },
          "count": {
              "type": "number",
              "description": "Number of values to generate. Default: 1",
              "default": 1
          },
          "options": {
              "type": "object",
              "properties": {
                  "min": {
                      "type": "number"
                  },
                  "max": {
                      "type": "number"
                  },
                  "length": {
                      "type": "number"
                  }
              },
              "description": "Type-specific options"
          }
      },
      "required": [
          "type"
      ]
  },

  async handler(args: Record<string, unknown>) {
    const type = args.type as string;
    const count = Math.min((args.count as number) || 1, 100);
    const options = (args.options as Record<string, unknown>) || {};
    
    const firstNames = ['James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth', 'Sarah', 'Alex', 'Emma', 'Noah', 'Olivia', 'Liam', 'Ava', 'Sofia'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson'];
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com', 'test.io', 'company.org'];
    const words = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'labore', 'magna', 'aliqua'];
    const companies = ['Acme Corp', 'TechStart', 'DataFlow', 'CloudNine', 'ByteWorks', 'CodeCraft', 'NetSphere', 'PixelPro'];
    
    const rand = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    
    const generators: Record<string, () => unknown> = {
      firstName: () => rand(firstNames),
      lastName: () => rand(lastNames),
      name: () => `${rand(firstNames)} ${rand(lastNames)}`,
      email: () => `${rand(firstNames).toLowerCase()}${randInt(1, 999)}@${rand(domains)}`,
      phone: () => `+1-${randInt(200, 999)}-${randInt(200, 999)}-${randInt(1000, 9999)}`,
      uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      }),
      date: () => new Date(Date.now() - randInt(0, 365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
      boolean: () => Math.random() > 0.5,
      number: () => randInt((options.min as number) || 0, (options.max as number) || 1000),
      word: () => rand(words),
      sentence: () => Array.from({ length: randInt(5, 12) }, () => rand(words)).join(' ') + '.',
      paragraph: () => Array.from({ length: randInt(3, 6) }, () => 
        Array.from({ length: randInt(5, 12) }, () => rand(words)).join(' ') + '.'
      ).join(' '),
      url: () => `https://${rand(['www', 'api', 'app'])}.${rand(['example', 'test', 'demo'])}.${rand(['com', 'io', 'org'])}/${rand(words)}`,
      ipv4: () => `${randInt(1, 255)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`,
      username: () => `${rand(firstNames).toLowerCase()}${randInt(1, 9999)}`,
      password: () => Array.from({ length: (options.length as number) || 12 }, () => 
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'[randInt(0, 66)]
      ).join(''),
      hexColor: () => '#' + Array.from({ length: 6 }, () => '0123456789ABCDEF'[randInt(0, 15)]).join(''),
      company: () => rand(companies),
    };
    
    const gen = generators[type];
    if (!gen) return { error: `Unknown type: ${type}. Available: ${Object.keys(generators).join(', ')}` };
    
    const data = count === 1 ? gen() : Array.from({ length: count }, gen);
    return { type, count, data };
  },
};
