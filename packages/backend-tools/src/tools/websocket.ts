import WebSocket from 'ws';

// Global store for active socket connections
const activeSockets = new Map<string, { ws: WebSocket; messages: any[] }>();

export interface WebSocketOptions {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Connect to a WebSocket endpoint
 */
export async function ws_connect(options: WebSocketOptions): Promise<{ connectionId: string; success: boolean }> {
  const connectionId = `ws_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(options.url, { headers: options.headers });
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timed out after ${options.timeout || 5000}ms`));
      }, options.timeout || 5000);

      ws.on('open', () => {
        clearTimeout(timeout);
        activeSockets.set(connectionId, { ws, messages: [] });
        resolve({ connectionId, success: true });
      });

      ws.on('message', (data) => {
        const entry = activeSockets.get(connectionId);
        if (entry) {
          entry.messages.push({
            timestamp: Date.now(),
            data: data.toString(),
          });
          // Keep buffer size reasonable
          if (entry.messages.length > 100) entry.messages.shift();
        }
      });

      ws.on('error', (err) => {
        console.error(`WS Error [${connectionId}]:`, err);
      });

    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Send a message over an active WebSocket connection
 */
export async function ws_send(connectionId: string, message: string | object): Promise<{ success: boolean }> {
  const entry = activeSockets.get(connectionId);
  if (!entry) throw new Error(`Connection ${connectionId} not found`);
  if (entry.ws.readyState !== WebSocket.OPEN) throw new Error(`Connection ${connectionId} is not open`);

  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  
  return new Promise((resolve, reject) => {
    entry.ws.send(payload, (err) => {
      if (err) reject(err);
      else resolve({ success: true });
    });
  });
}

/**
 * Wait for a specific message pattern on the socket
 */
export async function ws_wait_for_message(
  connectionId: string, 
  pattern: string | object, 
  timeout: number = 5000
): Promise<{ found: boolean; message?: any }> {
  const entry = activeSockets.get(connectionId);
  if (!entry) throw new Error(`Connection ${connectionId} not found`);

  const startTime = Date.now();
  const searchPattern = typeof pattern === 'string' ? pattern : JSON.stringify(pattern);

  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // Check existing buffer
      const match = entry.messages.find(m => m.data.includes(searchPattern));
      if (match) {
        clearInterval(checkInterval);
        resolve({ found: true, message: match });
        return;
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        resolve({ found: false });
      }
    }, 100);
  });
}

/**
 * Close a WebSocket connection
 */
export async function ws_close(connectionId: string): Promise<{ success: boolean }> {
  const entry = activeSockets.get(connectionId);
  if (entry) {
    entry.ws.close();
    activeSockets.delete(connectionId);
    return { success: true };
  }
  return { success: false };
}
