import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) => c.text('Hello Hono!'));

const port = 3334;
console.log(`Test Server running on ${port}`);

serve({
  fetch: app.fetch,
  port
});
