#!/usr/bin/env npx tsx
/**
 * FakeSaaS - A simulated SaaS application for E2E testing
 *
 * Features:
 * - Login page with validation
 * - Dashboard with metrics
 * - Settings page
 * - API endpoints
 * - Intentional flaky behavior for testing
 * - Console logs for observability testing
 */

import http from 'http';
import { parse } from 'url';

// Parse CLI arguments: --port=XXXX or -p XXXX
function getPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--port=')) {
      return parseInt(args[i].split('=')[1], 10);
    }
    if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      return parseInt(args[i + 1], 10);
    }
  }
  // Fall back to environment variable or default
  return parseInt(process.env.PORT || '4000', 10);
}

const PORT = getPort();

// Simulated database
const users = new Map([
  ['demo@example.com', { password: 'demo123', name: 'Demo User', plan: 'Pro' }],
  ['admin@example.com', { password: 'admin123', name: 'Admin User', plan: 'Enterprise' }],
]);

const sessions = new Map<string, string>();

// Flaky behavior control
let requestCount = 0;
const FLAKY_RATE = 0.15; // 15% chance of flaky behavior

function isFlaky(): boolean {
  requestCount++;
  return Math.random() < FLAKY_RATE;
}

// HTML Templates
const styles = `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .auth-card {
      background: white;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      width: 100%;
      max-width: 400px;
    }
    .auth-card h1 {
      text-align: center;
      margin-bottom: 30px;
      color: #333;
    }
    .auth-card .logo {
      text-align: center;
      font-size: 2em;
      margin-bottom: 20px;
    }
    .form-group { margin-bottom: 20px; }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 500;
      color: #555;
    }
    .form-group input {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e1e1e1;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
    }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .btn-secondary { background: #6c757d; }
    .btn-danger { background: #dc3545; }
    .error-message {
      background: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: none;
    }
    .error-message.show { display: block; }
    .dashboard {
      background: #f5f7fa;
      min-height: 100vh;
    }
    .nav {
      background: white;
      padding: 15px 30px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .nav-brand {
      font-size: 1.5em;
      font-weight: bold;
      color: #667eea;
    }
    .nav-links a {
      margin-left: 20px;
      text-decoration: none;
      color: #555;
      font-weight: 500;
    }
    .nav-links a:hover { color: #667eea; }
    .nav-links a.active { color: #667eea; border-bottom: 2px solid #667eea; }
    .dashboard-content { padding: 30px; }
    .welcome-banner {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .welcome-banner h1 { margin-bottom: 10px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    }
    .stat-card h3 { color: #888; font-size: 0.9em; margin-bottom: 10px; }
    .stat-card .value { font-size: 2.5em; font-weight: bold; color: #333; }
    .stat-card .change { font-size: 0.9em; margin-top: 5px; }
    .stat-card .change.positive { color: #22c55e; }
    .stat-card .change.negative { color: #ef4444; }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
      margin-bottom: 20px;
    }
    .card-header {
      padding: 20px;
      border-bottom: 1px solid #eee;
      font-weight: 600;
    }
    .card-body { padding: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
    th { color: #888; font-weight: 500; }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 0.8em;
      font-weight: 500;
    }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .settings-form { max-width: 600px; }
    .settings-section {
      background: white;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
    }
    .settings-section h2 {
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #eee;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #333;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      display: none;
      z-index: 1000;
    }
    .toast.show { display: block; animation: slideIn 0.3s ease; }
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .video-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      padding: 20px;
    }
    .video-player {
      background: #000;
      aspect-ratio: 16/9;
      border-radius: 8px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .video-overlay {
      position: absolute;
      top: 10px;
      left: 10px;
      color: #0f0;
      font-family: monospace;
      font-size: 12px;
      background: rgba(0,0,0,0.5);
      padding: 4px;
    }
    .video-controls {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      background: rgba(0,0,0,0.7);
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .play-btn { color: white; cursor: pointer; }
    .progress-bar {
      flex-grow: 1;
      height: 4px;
      background: #444;
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      width: 0%;
      height: 100%;
      background: #f00;
      transition: width 0.2s linear;
    }
    .video-content {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      color: #333;
      font-size: 20px;
      background: linear-gradient(45deg, #111 25%, #1a1a1a 25%, #1a1a1a 50%, #111 50%, #111 75%, #1a1a1a 75%, #1a1a1a 100%);
      background-size: 20px 20px;
    }
    .buffer-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      display: none;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
`;

const loginPage = `<!DOCTYPE html>
<html>
<head>
  <title>Login - FakeSaaS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${styles}
</head>
<body>
  <div class="auth-container">
    <div class="auth-card">
      <div class="logo">🚀</div>
      <h1>Welcome to FakeSaaS</h1>
      <div id="error" class="error-message"></div>
      <form id="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" placeholder="demo@example.com" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" placeholder="demo123" required>
        </div>
        <button type="submit" class="btn" id="login-btn">Sign In</button>
      </form>
      <p style="text-align: center; margin-top: 20px; color: #888;">
        Demo: demo@example.com / demo123
      </p>
    </div>
  </div>
  <script>
    console.log('[FakeSaaS] Login page loaded');
    console.info('[FakeSaaS] Version 2.1.0');

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('[FakeSaaS] Login attempt started');

      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const btn = document.getElementById('login-btn');
      const error = document.getElementById('error');

      btn.disabled = true;
      btn.textContent = 'Signing in...';
      error.classList.remove('show');

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (data.success) {
          console.log('[FakeSaaS] Login successful');
          window.location.href = '/dashboard';
        } else {
          console.error('[FakeSaaS] Login failed:', data.error);
          error.textContent = data.error;
          error.classList.add('show');
          btn.disabled = false;
          btn.textContent = 'Sign In';
        }
      } catch (err) {
        console.error('[FakeSaaS] Network error:', err.message);
        error.textContent = 'Network error. Please try again.';
        error.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  </script>
</body>
</html>`;

function getDashboardPage(userName: string, plan: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Dashboard - FakeSaaS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${styles}
</head>
<body class="dashboard">
  <nav class="nav">
    <div class="nav-brand">🚀 FakeSaaS</div>
    <div class="nav-links">
      <a href="/dashboard" class="${path === '/dashboard' ? 'active' : ''}">Dashboard</a>
      <a href="/videowall" class="${path === '/videowall' ? 'active' : ''}">Video Wall</a>
      <a href="/settings" class="${path === '/settings' ? 'active' : ''}">Settings</a>
      <a href="/api/logout" id="logout-btn">Logout</a>
    </div>
  </nav>

  <div class="dashboard-content container">
    <div class="welcome-banner">
      <h1>Welcome back, ${userName}!</h1>
      <p>You're on the ${plan} plan. Here's your overview.</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Users</h3>
        <div class="value" id="stat-users">1,234</div>
        <div class="change positive">↑ 12% from last month</div>
      </div>
      <div class="stat-card">
        <h3>Revenue</h3>
        <div class="value" id="stat-revenue">$45,678</div>
        <div class="change positive">↑ 8% from last month</div>
      </div>
      <div class="stat-card">
        <h3>Active Projects</h3>
        <div class="value" id="stat-projects">56</div>
        <div class="change negative">↓ 3% from last month</div>
      </div>
      <div class="stat-card">
        <h3>Uptime</h3>
        <div class="value" id="stat-uptime">99.9%</div>
        <div class="change positive">Stable</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Recent Activity</div>
      <div class="card-body">
        <table>
          <thead>
            <tr><th>Event</th><th>User</th><th>Status</th><th>Time</th></tr>
          </thead>
          <tbody id="activity-table">
            <tr>
              <td>New signup</td>
              <td>john@company.com</td>
              <td><span class="badge badge-success">Completed</span></td>
              <td>2 min ago</td>
            </tr>
            <tr>
              <td>Payment received</td>
              <td>sarah@startup.io</td>
              <td><span class="badge badge-success">Completed</span></td>
              <td>15 min ago</td>
            </tr>
            <tr>
              <td>Project created</td>
              <td>mike@agency.co</td>
              <td><span class="badge badge-warning">Pending</span></td>
              <td>1 hour ago</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-header">Quick Actions</div>
      <div class="card-body">
        <button class="btn" id="refresh-btn" style="width: auto; margin-right: 10px;">Refresh Data</button>
        <button class="btn btn-secondary" id="export-btn" style="width: auto;">Export Report</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    console.log('[FakeSaaS] Dashboard loaded');
    console.info('[FakeSaaS] User: ${userName}, Plan: ${plan}');

    document.getElementById('refresh-btn').addEventListener('click', async () => {
      console.log('[FakeSaaS] Refreshing data...');
      const btn = document.getElementById('refresh-btn');
      btn.disabled = true;
      btn.textContent = 'Refreshing...';

      try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        if (data.error) {
          console.error('[FakeSaaS] Refresh failed:', data.error);
          showToast('Failed to refresh: ' + data.error);
        } else {
          console.log('[FakeSaaS] Data refreshed successfully');
          document.getElementById('stat-users').textContent = data.users.toLocaleString();
          document.getElementById('stat-revenue').textContent = '$' + data.revenue.toLocaleString();
          showToast('Data refreshed!');
        }
      } catch (err) {
        console.error('[FakeSaaS] Network error:', err.message);
        showToast('Network error');
      }

      btn.disabled = false;
      btn.textContent = 'Refresh Data';
    });

    document.getElementById('export-btn').addEventListener('click', () => {
      console.log('[FakeSaaS] Export requested');
      showToast('Report exported to email');
    });

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>`;
}

function getVideoWallPage(userName: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Video Wall - FakeSaaS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${styles}
</head>
<body class="dashboard">
  <nav class="nav">
    <div class="nav-brand">🚀 FakeSaaS</div>
    <div class="nav-links">
      <a href="/dashboard">Dashboard</a>
      <a href="/videowall" class="active">Video Wall</a>
      <a href="/settings">Settings</a>
      <a href="/api/logout">Logout</a>
    </div>
  </nav>

  <div class="dashboard-content container">
    <div class="welcome-banner" style="background: #111;">
      <h1>Security Center</h1>
      <p>Monitoring 4 active streams for ${userName}</p>
    </div>

    <div class="video-grid">
      <!-- Cam 1 -->
      <div class="video-player" id="cam1">
        <div class="video-content">
          <div class="buffer-spinner"></div>
          <span class="cam-label">CAM 01 - LOBBY</span>
        </div>
        <div class="video-overlay">LIVE • <span class="bitrate">4500</span> kbps</div>
        <div class="video-controls">
          <div class="play-btn">❚❚</div>
          <div class="progress-bar"><div class="progress-fill" style="width: 100%"></div></div>
        </div>
      </div>

      <!-- Cam 2 -->
      <div class="video-player" id="cam2">
        <div class="video-content">
          <div class="buffer-spinner"></div>
          <span class="cam-label">CAM 02 - SERVER ROOM</span>
        </div>
        <div class="video-overlay">REC • <span class="bitrate">2200</span> kbps</div>
        <div class="video-controls">
          <div class="play-btn">▶</div>
          <div class="progress-bar"><div class="progress-fill" style="width: 45%"></div></div>
        </div>
      </div>

      <!-- Cam 3 -->
      <div class="video-player" id="cam3">
        <div class="video-content">
          <div class="buffer-spinner"></div>
          <span class="cam-label">CAM 03 - PARKING</span>
        </div>
        <div class="video-overlay">LIVE • <span class="bitrate">3800</span> kbps</div>
        <div class="video-controls">
          <div class="play-btn">❚❚</div>
          <div class="progress-bar"><div class="progress-fill" style="width: 98%"></div></div>
        </div>
      </div>

      <!-- Cam 4 -->
      <div class="video-player" id="cam4">
        <div class="video-content">
          <div class="buffer-spinner"></div>
          <span class="cam-label">CAM 04 - BREAK ROOM</span>
        </div>
        <div class="video-overlay">OFFLINE</div>
        <div class="video-controls">
          <div class="play-btn">⟳</div>
          <div class="progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
        </div>
      </div>
    </div>
  </div>

  <script>
    console.log('[FakeSaaS] Video Wall loaded');
    
    // Simulate active bitrates
    setInterval(() => {
      document.querySelectorAll('.bitrate').forEach(el => {
        const base = parseInt(el.textContent);
        const flutter = Math.floor(Math.random() * 200) - 100;
        el.textContent = Math.max(100, base + flutter);
      });
    }, 1000);

    // Simulate buffering
    setInterval(() => {
      const cams = ['cam1', 'cam2', 'cam3'];
      const victim = cams[Math.floor(Math.random() * cams.length)];
      const el = document.getElementById(victim);
      const spinner = el.querySelector('.buffer-spinner');
      const label = el.querySelector('.cam-label');
      
      if (Math.random() < 0.3) {
        spinner.style.display = 'block';
        label.style.display = 'none';
        setTimeout(() => {
           spinner.style.display = 'none';
           label.style.display = 'block';
        }, 1500);
      }
    }, 3000);
  </script>
</body>
</html>`;
}

function getSettingsPage(userName: string, email: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Settings - FakeSaaS</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${styles}
</head>
<body class="dashboard">
  <nav class="nav">
    <div class="nav-brand">🚀 FakeSaaS</div>
    <div class="nav-links">
      <a href="/dashboard">Dashboard</a>
      <a href="/settings" class="active">Settings</a>
      <a href="/api/logout">Logout</a>
    </div>
  </nav>

  <div class="dashboard-content container">
    <h1 style="margin-bottom: 30px;">Settings</h1>

    <div class="settings-form">
      <div class="settings-section">
        <h2>Profile</h2>
        <form id="profile-form">
          <div class="form-group">
            <label for="name">Display Name</label>
            <input type="text" id="name" value="${userName}">
          </div>
          <div class="form-group">
            <label for="settings-email">Email</label>
            <input type="email" id="settings-email" value="${email}" disabled>
          </div>
          <button type="submit" class="btn" style="width: auto;">Save Changes</button>
        </form>
      </div>

      <div class="settings-section">
        <h2>Notifications</h2>
        <div class="form-group">
          <label><input type="checkbox" id="notify-email" checked> Email notifications</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" id="notify-slack"> Slack notifications</label>
        </div>
      </div>

      <div class="settings-section">
        <h2>Danger Zone</h2>
        <p style="color: #666; margin-bottom: 15px;">These actions are irreversible.</p>
        <button class="btn btn-danger" id="delete-btn" style="width: auto;">Delete Account</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    console.log('[FakeSaaS] Settings page loaded');

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      console.log('[FakeSaaS] Saving profile...');

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('name').value,
          notifications: {
            email: document.getElementById('notify-email').checked,
            slack: document.getElementById('notify-slack').checked,
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        console.log('[FakeSaaS] Settings saved');
        showToast('Settings saved!');
      } else {
        console.error('[FakeSaaS] Save failed:', data.error);
        showToast('Failed to save: ' + data.error);
      }
    });

    document.getElementById('delete-btn').addEventListener('click', () => {
      if (confirm('Are you sure? This cannot be undone.')) {
        console.warn('[FakeSaaS] Account deletion requested');
        showToast('Account deletion is disabled in demo');
      }
    });

    function showToast(message) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  </script>
</body>
</html>`;
}

// Request handler
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = parse(req.url || '/', true);
  const pathname = url.pathname || '/';
  const method = req.method || 'GET';

  // Get session
  const cookies = req.headers.cookie?.split(';').reduce((acc, c) => {
    const [key, val] = c.trim().split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>) || {};

  const sessionId = cookies['session'];
  const userEmail = sessionId ? sessions.get(sessionId) : null;
  const user = userEmail ? users.get(userEmail) : null;

  console.log('[FakeSaaS] ' + method + ' ' + pathname + ' (session: ' + (sessionId ? 'yes' : 'no') + ')');

  // API Routes
  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');

    if (pathname === '/api/login' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        const { email, password } = JSON.parse(body);
        const loginUser = users.get(email);

        // Simulate flaky behavior
        if (isFlaky()) {
          console.log('[FakeSaaS] Simulating network delay...');
          setTimeout(() => {
            res.statusCode = 503;
            res.end(JSON.stringify({ success: false, error: 'Service temporarily unavailable' }));
          }, 2000);
          return;
        }

        if (loginUser && loginUser.password === password) {
          const sid = Math.random().toString(36).substring(2);
          sessions.set(sid, email);
          res.setHeader('Set-Cookie', 'session=' + sid + '; Path=/; HttpOnly');
          res.end(JSON.stringify({ success: true }));
        } else {
          res.statusCode = 401;
          res.end(JSON.stringify({ success: false, error: 'Invalid email or password' }));
        }
      });
      return;
    }

    if (pathname === '/api/logout') {
      if (sessionId) sessions.delete(sessionId);
      res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0');
      res.setHeader('Location', '/');
      res.statusCode = 302;
      res.end();
      return;
    }

    if (pathname === '/api/stats') {
      // Simulate flaky API
      if (isFlaky()) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal server error' }));
        return;
      }

      res.end(JSON.stringify({
        users: 1234 + Math.floor(Math.random() * 100),
        revenue: 45678 + Math.floor(Math.random() * 1000),
        projects: 56 + Math.floor(Math.random() * 10),
        uptime: 99.9,
      }));
      return;
    }

    if (pathname === '/api/settings' && method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        // Simulate flaky save
        if (isFlaky()) {
          res.statusCode = 500;
          res.end(JSON.stringify({ success: false, error: 'Database timeout' }));
          return;
        }
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }

    if (pathname === '/api/health') {
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // HTML Routes
  res.setHeader('Content-Type', 'text/html');

  if (pathname === '/' || pathname === '/login') {
    if (user) {
      res.setHeader('Location', '/dashboard');
      res.statusCode = 302;
      res.end();
    } else {
      res.end(loginPage);
    }
    return;
  }

  if (pathname === '/dashboard') {
    if (!user) {
      res.setHeader('Location', '/');
      res.statusCode = 302;
      res.end();
    } else {
      res.end(getDashboardPage(user.name, user.plan));
    }
    return;
  }

  if (pathname === '/videowall') {
    if (!user) {
      res.setHeader('Location', '/');
      res.statusCode = 302;
      res.end();
    } else {
      res.end(getVideoWallPage(user.name));
    }
    return;
  }

  if (pathname === '/settings') {
    if (!user || !userEmail) {
      res.setHeader('Location', '/');
      res.statusCode = 302;
      res.end();
    } else {
      res.end(getSettingsPage(user.name, userEmail));
    }
    return;
  }

  res.statusCode = 404;
  res.end('<h1>404 Not Found</h1>');
}

// Start server
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('================================================================');
  console.log('                   FakeSaaS Server                              ');
  console.log('================================================================');
  console.log('');
  console.log('   URL:        http://localhost:' + PORT);
  console.log('   Login:      demo@example.com / demo123');
  console.log('   Flaky Rate: ' + (FLAKY_RATE * 100).toFixed(0) + '%');
  console.log('');
  console.log('   Press Ctrl+C to stop');
  console.log('');
  console.log('================================================================');
  console.log('');
});
