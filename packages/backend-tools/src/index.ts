import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { JSONPath } from 'jsonpath-plus';

// =============================================================================
// Types
// =============================================================================

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  body?: unknown;
  auth?: {
    type: 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };
  timeout?: number;
  validateStatus?: boolean; // If false, don't throw on 4xx/5xx
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  data: unknown;
  duration: number;
  size: number;
}

// =============================================================================
// The Core Request Engine
// =============================================================================

export async function makeRequest(options: ApiRequestOptions): Promise<ApiResponse> {
  const config: AxiosRequestConfig = {
    method: options.method,
    url: options.url,
    headers: options.headers || {},
    params: options.params,
    data: options.body,
    timeout: options.timeout || 10000,
    validateStatus: options.validateStatus ? undefined : () => true, // Allow all status codes if validation skipped
  };

  // Handle Auth
  if (options.auth) {
    if (options.auth.type === 'bearer' && options.auth.token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${options.auth.token}`,
      };
    } else if (options.auth.type === 'basic' && options.auth.username) {
      config.auth = {
        username: options.auth.username,
        password: options.auth.password || '',
      };
    }
  }

  const startTime = Date.now();

  try {
    const response = await axios(config);
    const duration = Date.now() - startTime;
    
    // Calculate size (rough estimate)
    const size = JSON.stringify(response.data).length + JSON.stringify(response.headers).length;

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, unknown>,
      data: response.data,
      duration,
      size,
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    if (error.response) {
      // The request was made and the server responded with a status code
      return {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data,
        duration,
        size: 0,
      };
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error(`No response received: ${error.message}`);
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Request setup error: ${error.message}`);
    }
  }
}

// =============================================================================
// Assertion Logic
// =============================================================================

export function assertResponse(
  response: ApiResponse,
  assertions: Array<{
    type: 'status' | 'header' | 'body' | 'time';
    key?: string; // For header or body path
    operator: 'equals' | 'contains' | 'exists' | 'lt' | 'gt';
    value?: unknown;
  }>
): { success: boolean; failures: string[] } {
  const failures: string[] = [];

  for (const assertion of assertions) {
    switch (assertion.type) {
      case 'status':
        if (assertion.operator === 'equals' && response.status !== assertion.value) {
          failures.push(`Expected status ${assertion.value}, got ${response.status}`);
        }
        break;

      case 'time':
        if (assertion.operator === 'lt' && response.duration >= (assertion.value as number)) {
          failures.push(`Expected duration < ${assertion.value}ms, got ${response.duration}ms`);
        }
        break;

      case 'header':
        if (!assertion.key) continue;
        const headerVal = response.headers[assertion.key.toLowerCase()];
        if (assertion.operator === 'exists' && !headerVal) {
          failures.push(`Expected header ${assertion.key} to exist`);
        } else if (assertion.operator === 'equals' && headerVal !== assertion.value) {
          failures.push(`Expected header ${assertion.key} to be ${assertion.value}, got ${headerVal}`);
        }
        break;

      case 'body':
        if (!assertion.key) continue; // Root body check not implemented yet
        const found = JSONPath({ path: assertion.key, json: response.data as object }); // Cast data to object for now
        const val = found[0]; // Take first match

        if (assertion.operator === 'exists' && (val === undefined || val === null)) {
          failures.push(`Expected JSON path ${assertion.key} to exist`);
        } else if (assertion.operator === 'equals' && val !== assertion.value) {
          failures.push(`Expected path ${assertion.key} == ${assertion.value}, got ${val}`);
        } else if (assertion.operator === 'contains' && typeof val === 'string' && !val.includes(assertion.value as string)) {
          failures.push(`Expected path ${assertion.key} to contain "${assertion.value}", got "${val}"`);
        }
        break;
    }
  }

  return {
    success: failures.length === 0,
    failures,
  };
}
