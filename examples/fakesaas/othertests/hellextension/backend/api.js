/**
 * Hell Extension Backend API
 *
 * Simple Express server that the extension interacts with.
 * Supports configurable chaos (delays, failures, etc.)
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 6666;

// In-memory storage
const store = {
  notes: {},        // tabId -> note
  likes: {},        // pageId -> count
  user: {
    id: 'hell-user-001',
    name: 'Test User',
    email: 'test@hellextension.local',
    plan: 'chaos'
  },
  actions: []       // Action log
};

// Chaos configuration
let chaos = {
  delayMs: 0,           // Add delay to all responses
  failRate: 0,          // 0-1, chance of 500 error
  slowEndpoints: [],    // Specific endpoints to slow down
  downEndpoints: []     // Specific endpoints that return 503
};

// Chaos middleware
app.use((req, res, next) => {
  const endpoint = req.path;

  // Check if endpoint is down
  if (chaos.downEndpoints.includes(endpoint)) {
    return res.status(503).json({ error: 'Service Unavailable (Chaos Mode)' });
  }

  // Random failure
  if (Math.random() < chaos.failRate) {
    return res.status(500).json({ error: 'Random Chaos Failure' });
  }

  // Apply delay
  let delay = chaos.delayMs;
  if (chaos.slowEndpoints.includes(endpoint)) {
    delay += 3000; // Extra 3s for slow endpoints
  }

  if (delay > 0) {
    setTimeout(next, delay);
  } else {
    next();
  }
});

// ============ USER ENDPOINTS ============

// Get current user
app.get('/api/user', (req, res) => {
  res.json({
    success: true,
    data: store.user,
    timestamp: Date.now()
  });
});

// Update user preferences
app.patch('/api/user', (req, res) => {
  Object.assign(store.user, req.body);
  res.json({
    success: true,
    data: store.user
  });
});

// ============ TAB DATA ENDPOINTS ============

// Get data for a specific tab/page
app.get('/api/tab-data/:tabId', (req, res) => {
  const { tabId } = req.params;

  // Simulate fetching tab-specific data
  const data = {
    tabId,
    serverTime: new Date().toISOString(),
    note: store.notes[tabId] || null,
    likes: store.likes[tabId] || 0,
    metadata: {
      requestId: Math.random().toString(36).substr(2, 9),
      processedBy: 'hell-api-v1',
      chaosActive: chaos.delayMs > 0 || chaos.failRate > 0
    }
  };

  res.json({
    success: true,
    data,
    timestamp: Date.now()
  });
});

// ============ NOTES ENDPOINTS ============

// Get note for tab
app.get('/api/notes/:tabId', (req, res) => {
  const { tabId } = req.params;
  res.json({
    success: true,
    data: {
      tabId,
      note: store.notes[tabId] || '',
      updatedAt: store.notes[`${tabId}_updated`] || null
    }
  });
});

// Save note for tab
app.post('/api/notes/:tabId', (req, res) => {
  const { tabId } = req.params;
  const { note } = req.body;

  store.notes[tabId] = note;
  store.notes[`${tabId}_updated`] = Date.now();

  res.json({
    success: true,
    data: {
      tabId,
      note,
      updatedAt: store.notes[`${tabId}_updated`]
    }
  });
});

// Delete note
app.delete('/api/notes/:tabId', (req, res) => {
  const { tabId } = req.params;
  delete store.notes[tabId];
  delete store.notes[`${tabId}_updated`];

  res.json({ success: true });
});

// ============ ACTIONS ENDPOINTS ============

// Log an action (like, share, etc.)
app.post('/api/actions', (req, res) => {
  const action = {
    id: Math.random().toString(36).substr(2, 9),
    ...req.body,
    timestamp: Date.now()
  };

  store.actions.push(action);

  // Handle specific action types
  if (action.type === 'like' && action.pageId) {
    store.likes[action.pageId] = (store.likes[action.pageId] || 0) + 1;
  }

  res.json({
    success: true,
    data: action,
    totalActions: store.actions.length
  });
});

// Get action history
app.get('/api/actions', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    success: true,
    data: store.actions.slice(-limit),
    total: store.actions.length
  });
});

// ============ LIKES ENDPOINTS ============

// Get likes for a page
app.get('/api/likes/:pageId', (req, res) => {
  const { pageId } = req.params;
  res.json({
    success: true,
    data: {
      pageId,
      count: store.likes[pageId] || 0
    }
  });
});

// Like a page
app.post('/api/likes/:pageId', (req, res) => {
  const { pageId } = req.params;
  store.likes[pageId] = (store.likes[pageId] || 0) + 1;

  res.json({
    success: true,
    data: {
      pageId,
      count: store.likes[pageId]
    }
  });
});

// ============ CHAOS CONTROL ENDPOINTS ============

// Get chaos config
app.get('/api/chaos', (req, res) => {
  res.json({
    success: true,
    data: chaos
  });
});

// Update chaos config
app.post('/api/chaos', (req, res) => {
  Object.assign(chaos, req.body);
  console.log('[API] Chaos config updated:', chaos);
  res.json({
    success: true,
    data: chaos
  });
});

// Reset chaos
app.delete('/api/chaos', (req, res) => {
  chaos = {
    delayMs: 0,
    failRate: 0,
    slowEndpoints: [],
    downEndpoints: []
  };
  res.json({
    success: true,
    data: chaos
  });
});

// ============ HEALTH & DEBUG ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    chaos: chaos.delayMs > 0 || chaos.failRate > 0 ? 'active' : 'inactive'
  });
});

app.get('/api/debug/store', (req, res) => {
  res.json({
    success: true,
    data: store
  });
});

// Reset all data
app.post('/api/debug/reset', (req, res) => {
  store.notes = {};
  store.likes = {};
  store.actions = [];
  res.json({ success: true, message: 'Store reset' });
});

// ============ START SERVER ============

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                 HELL EXTENSION BACKEND API                    ║
╠══════════════════════════════════════════════════════════════╣
║  Base URL:  http://localhost:${PORT}                            ║
╠══════════════════════════════════════════════════════════════╣
║  Endpoints:                                                   ║
║    GET  /api/user              - Get user info                ║
║    GET  /api/tab-data/:tabId   - Get tab-specific data        ║
║    GET  /api/notes/:tabId      - Get note for tab             ║
║    POST /api/notes/:tabId      - Save note for tab            ║
║    POST /api/actions           - Log an action                ║
║    POST /api/likes/:pageId     - Like a page                  ║
║    GET  /api/chaos             - Get chaos config             ║
║    POST /api/chaos             - Set chaos config             ║
║    GET  /api/health            - Health check                 ║
╠══════════════════════════════════════════════════════════════╣
║  Chaos Examples:                                              ║
║    curl -X POST localhost:${PORT}/api/chaos \\                  ║
║      -H "Content-Type: application/json" \\                   ║
║      -d '{"delayMs": 2000, "failRate": 0.3}'                  ║
╚══════════════════════════════════════════════════════════════╝
`);
});
