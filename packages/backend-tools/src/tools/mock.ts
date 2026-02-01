import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

// =============================================================================
// State
// =============================================================================

interface MockRoute {
  id: string;
  method: string;
  path: string; // can be regex string or exact match
  response: {
    status?: number;
    body?: any;
    headers?: Record<string, string>;
    delay?: number; // Simulate slow networks
  };
  calls: any[]; // History of requests to this route
}

// Map<Port, ServerInstance>
const activeServers = new Map<number, {
  server: Server;
  routes: MockRoute[];
  globalHistory: any[];
}>();

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Start a mock server on a specific port
 */
export async function mock_server_start(port: number = 0): Promise<{ port: number; success: boolean }> {
  return new Promise((resolve, reject) => {
    if (activeServers.has(port)) {
      resolve({ port, success: true });
      return;
    }

    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const entry = activeServers.get(port);
      if (!entry) {
        res.writeHead(500);
        res.end('Mock server state lost');
        return;
      }

      // Capture request body
      let body = '';
      req.on('data', chunk => body += chunk);
      await new Promise(r => req.on('end', r));

      const requestInfo = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body ? JSON.parse(body).catch(() => body) : undefined,
        timestamp: Date.now()
      };

      entry.globalHistory.push(requestInfo);

      // Find matching route
      // Prioritize exact matches over regex
      const route = entry.routes.find(r => {
        if (r.method !== req.method && r.method !== '*') return false;
        
        // Regex match
        if (r.path.startsWith('regex:')) {
          const pattern = new RegExp(r.path.replace('regex:', ''));
          return pattern.test(req.url || '');
        }
        
        // Exact match
        return r.path === req.url;
      });

      if (route) {
        route.calls.push(requestInfo);

        // Simulate Delay
        if (route.response.delay) {
          await new Promise(r => setTimeout(r, route.response.delay));
        }

        res.writeHead(route.response.status || 200, {
          'Content-Type': 'application/json',
          ...route.response.headers
        });
        
        res.end(JSON.stringify(route.response.body || {}));
      } else {
        // 404 for un-mocked routes
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Route not mocked', path: req.url }));
      }
    });

    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      
      activeServers.set(actualPort, {
        server,
        routes: [],
        globalHistory: []
      });
      
      resolve({ port: actualPort, success: true });
    });

    server.on('error', (err) => reject(err));
  });
}

/**
 * Add a route to a mock server
 */
export async function mock_add_route(
  port: number,
  method: string,
  path: string,
  response: { status?: number; body?: any; headers?: Record<string, string>; delay?: number }
): Promise<{ routeId: string }> {
  const entry = activeServers.get(port);
  if (!entry) throw new Error(`No server running on port ${port}`);

  const routeId = `route_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  
  entry.routes.push({
    id: routeId,
    method: method.toUpperCase(),
    path,
    response,
    calls: []
  });

  return { routeId };
}

/**
 * Stop a mock server
 */
export async function mock_server_stop(port: number): Promise<{ success: boolean }> {
  const entry = activeServers.get(port);
  if (entry) {
    return new Promise((resolve) => {
      entry.server.close(() => {
        activeServers.delete(port);
        resolve({ success: true });
      });
    });
  }
  return { success: false };
}

/**
 * Verify requests made to the mock server
 */
export async function mock_verify(port: number, routeId?: string): Promise<{ calls: any[] }> {
  const entry = activeServers.get(port);
  if (!entry) throw new Error(`No server running on port ${port}`);

  if (routeId) {
    const route = entry.routes.find(r => r.id === routeId);
    if (!route) throw new Error(`Route ${routeId} not found`);
    return { calls: route.calls };
  }

  return { calls: entry.globalHistory };
}
