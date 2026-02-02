import * as fs from 'fs/promises';

/**
 * THE NECROMANCER - Traffic Replay
 */

export interface ReplayStep {
  type: 'api_request';
  params: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
}

export async function parseHar(filePath: string): Promise<ReplayStep[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const har = JSON.parse(content);
  
  const steps: ReplayStep[] = [];

  for (const entry of har.log.entries) {
    const { request } = entry;
    
    // Convert headers array to object
    const headers: Record<string, string> = {};
    request.headers.forEach((h: any) => headers[h.name] = h.value);

    // Parse body
    let body = undefined;
    if (request.postData?.text) {
      try {
        body = JSON.parse(request.postData.text);
      } catch {
        body = request.postData.text;
      }
    }

    steps.push({
      type: 'api_request',
      params: {
        method: request.method,
        url: request.url,
        headers,
        body,
      }
    });
  }

  return steps;
}
