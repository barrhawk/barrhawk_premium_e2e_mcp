import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';

const app = new Hono();

app.use('/*', cors());

// API Routes
app.get('/api/health', (c) => c.json({ status: 'ok', mode: 'max' }));

// SSE Stream for Real-time Logs/Status
app.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    // Initial State
    await stream.writeSSE({
      data: JSON.stringify({ type: 'connected', timestamp: Date.now() }),
      event: 'message',
    });

    // Mock Data Generator for "Fancy" Demo
    const interval = setInterval(async () => {
      const metrics = {
        cpu: Math.random() * 100,
        memory: 40 + Math.random() * 20,
        activeAgents: ['Doctor', 'Igor', 'Frankenstein'],
        testRuns: Math.floor(Math.random() * 1000),
      };
      
      await stream.writeSSE({
        data: JSON.stringify({ type: 'metrics', payload: metrics }),
        event: 'message',
      });
    }, 1000);

    // Cleanup
    stream.onAbort(() => clearInterval(interval));

    // Keep connection open
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
});

// Serve Static Assets (Production)
app.use('/*', serveStatic({ root: './dist/client' }));
app.get('*', serveStatic({ path: './dist/client/index.html' }));

const port = 3000;
console.log(`Max Dashboard running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
