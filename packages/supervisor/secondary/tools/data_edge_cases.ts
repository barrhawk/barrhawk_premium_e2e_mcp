/**
 * Dynamic Tool: data_edge_cases
 * Created: 2026-01-23T14:30:11.241Z
 * Permissions: none
 *
 * Generate edge case values for testing (SQL injection, XSS, boundary values, unicode, etc.).
 */

import type { DynamicTool } from '../../shared/types.js';

export const tool: DynamicTool = {
  name: 'data_edge_cases',
  description: "Generate edge case values for testing (SQL injection, XSS, boundary values, unicode, etc.).",
  schema: {
      "type": "object",
      "properties": {
          "category": {
              "type": "string",
              "enum": [
                  "sql_injection",
                  "xss",
                  "path_traversal",
                  "boundary",
                  "unicode",
                  "empty",
                  "all"
              ],
              "description": "Category of edge cases. Default: all",
              "default": "all"
          },
          "limit": {
              "type": "number",
              "description": "Max cases per category. Default: 10",
              "default": 10
          }
      },
      "required": []
  },

  async handler(args: Record<string, unknown>) {
    const category = (args.category as string) || 'all';
    const limit = Math.min((args.limit as number) || 10, 50);
    
    const edgeCases: Record<string, Array<{value: string, description: string}>> = {
      sql_injection: [
        { value: "' OR '1'='1", description: "Basic SQL injection" },
        { value: "'; DROP TABLE users;--", description: "Drop table injection" },
        { value: "1; SELECT * FROM users", description: "Union injection" },
        { value: "admin'--", description: "Comment injection" },
        { value: "' UNION SELECT NULL,NULL--", description: "Union null injection" },
        { value: "1' AND '1'='1", description: "Boolean injection" },
        { value: "'; EXEC xp_cmdshell('dir');--", description: "Command execution" },
      ],
      xss: [
        { value: "<script>alert('xss')</script>", description: "Basic XSS" },
        { value: "<img src=x onerror=alert('xss')>", description: "Image onerror XSS" },
        { value: "javascript:alert('xss')", description: "JavaScript protocol" },
        { value: "<svg onload=alert('xss')>", description: "SVG onload XSS" },
        { value: "'><script>alert('xss')</script>", description: "Attribute escape XSS" },
        { value: "<body onload=alert('xss')>", description: "Body onload XSS" },
        { value: "<iframe src='javascript:alert(1)'>", description: "Iframe XSS" },
      ],
      path_traversal: [
        { value: "../../../etc/passwd", description: "Unix path traversal" },
        { value: "..\\..\\..\\windows\\system32", description: "Windows path traversal" },
        { value: "....//....//etc/passwd", description: "Double encoding traversal" },
        { value: "%2e%2e%2f%2e%2e%2f", description: "URL encoded traversal" },
        { value: "/etc/passwd%00.jpg", description: "Null byte injection" },
      ],
      boundary: [
        { value: "", description: "Empty string" },
        { value: " ", description: "Single space" },
        { value: "0", description: "Zero" },
        { value: "-1", description: "Negative one" },
        { value: "2147483647", description: "Max 32-bit int" },
        { value: "-2147483648", description: "Min 32-bit int" },
        { value: "9999999999999999", description: "Large number" },
        { value: "0.0000001", description: "Small decimal" },
        { value: "NaN", description: "Not a number" },
        { value: "Infinity", description: "Infinity" },
      ],
      unicode: [
        { value: "Hello\u0000World", description: "Null character" },
        { value: "\uFEFF", description: "BOM character" },
        { value: "test\u202Etest", description: "RTL override" },
        { value: "Caf\u00E9", description: "Latin accent" },
        { value: "\u4E2D\u6587", description: "Chinese characters" },
        { value: "\uD83D\uDE00", description: "Emoji" },
        { value: "test\ntest", description: "Newline" },
        { value: "test\rtest", description: "Carriage return" },
        { value: "test\ttest", description: "Tab character" },
      ],
      empty: [
        { value: "", description: "Empty string" },
        { value: "null", description: "Null string" },
        { value: "undefined", description: "Undefined string" },
        { value: "[]", description: "Empty array string" },
        { value: "{}", description: "Empty object string" },
        { value: "   ", description: "Whitespace only" },
      ],
    };
    
    let cases: Array<{category: string, value: string, description: string}> = [];
    
    const addCategory = (cat: string) => {
      const items = edgeCases[cat] || [];
      items.slice(0, limit).forEach(item => {
        cases.push({ category: cat, ...item });
      });
    };
    
    if (category === 'all') {
      Object.keys(edgeCases).forEach(addCategory);
    } else {
      addCategory(category);
    }
    
    return { category, count: cases.length, cases };
  },
};
