/**
 * Healing Test Server
 *
 * Serves different versions of a page to test self-healing selectors.
 * Each version mutates the target element's attributes.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 6700;

// Page versions - each mutates the login button differently
const pages = {
  // V1: Original - has ID, class, text
  v1: `<!DOCTYPE html>
<html>
<head>
  <title>Healing Test V1 - Original</title>
  <style>
    body { font-family: sans-serif; padding: 40px; background: #1a1a2e; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; }
    h1 { color: #e94560; }
    .version { background: #e94560; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }
    input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #333; border-radius: 4px; background: #16213e; color: #fff; }
    button { width: 100%; padding: 12px; margin-top: 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    #login-btn { background: #e94560; color: #fff; }
    #login-btn:hover { background: #ff6b6b; }
    .result { margin-top: 20px; padding: 12px; background: #00d26a; border-radius: 4px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <span class="version">V1: Original</span>
    <h1>Login</h1>
    <p>Button has: id="login-btn", class="btn-primary"</p>
    <form onsubmit="return handleSubmit()">
      <input type="email" id="email" placeholder="Email" value="test@example.com">
      <input type="password" id="password" placeholder="Password" value="secret123">
      <button type="submit" id="login-btn" class="btn-primary">Login</button>
    </form>
    <div class="result" id="result">Login successful!</div>
  </div>
  <script>
    function handleSubmit() {
      document.getElementById('result').style.display = 'block';
      return false;
    }
  </script>
</body>
</html>`,

  // V2: ID removed - only has class and text
  v2: `<!DOCTYPE html>
<html>
<head>
  <title>Healing Test V2 - ID Removed</title>
  <style>
    body { font-family: sans-serif; padding: 40px; background: #1a1a2e; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; }
    h1 { color: #ffc107; }
    .version { background: #ffc107; color: #000; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }
    input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #333; border-radius: 4px; background: #16213e; color: #fff; }
    button { width: 100%; padding: 12px; margin-top: 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    .btn-login { background: #ffc107; color: #000; }
    .btn-login:hover { background: #ffeb3b; }
    .result { margin-top: 20px; padding: 12px; background: #00d26a; border-radius: 4px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <span class="version">V2: ID Removed</span>
    <h1>Login</h1>
    <p>Button has: class="btn-login" (NO ID!)</p>
    <form onsubmit="return handleSubmit()">
      <input type="email" placeholder="Email" value="test@example.com">
      <input type="password" placeholder="Password" value="secret123">
      <button type="submit" class="btn-login">Login</button>
    </form>
    <div class="result" id="result">Login successful!</div>
  </div>
  <script>
    function handleSubmit() {
      document.getElementById('result').style.display = 'block';
      return false;
    }
  </script>
</body>
</html>`,

  // V3: Has data-testid instead
  v3: `<!DOCTYPE html>
<html>
<head>
  <title>Healing Test V3 - data-testid</title>
  <style>
    body { font-family: sans-serif; padding: 40px; background: #1a1a2e; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; }
    h1 { color: #00d26a; }
    .version { background: #00d26a; color: #000; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }
    input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #333; border-radius: 4px; background: #16213e; color: #fff; }
    button { width: 100%; padding: 12px; margin-top: 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    .submit-action { background: #00d26a; color: #000; }
    .submit-action:hover { background: #00ff88; }
    .result { margin-top: 20px; padding: 12px; background: #00d26a; border-radius: 4px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <span class="version">V3: data-testid</span>
    <h1>Login</h1>
    <p>Button has: data-testid="login-button", class="submit-action"</p>
    <form onsubmit="return handleSubmit()">
      <input type="email" placeholder="Email" value="test@example.com">
      <input type="password" placeholder="Password" value="secret123">
      <button type="submit" data-testid="login-button" class="submit-action">Login</button>
    </form>
    <div class="result" id="result">Login successful!</div>
  </div>
  <script>
    function handleSubmit() {
      document.getElementById('result').style.display = 'block';
      return false;
    }
  </script>
</body>
</html>`,

  // V4: Only aria-label and different text
  v4: `<!DOCTYPE html>
<html>
<head>
  <title>Healing Test V4 - aria-label only</title>
  <style>
    body { font-family: sans-serif; padding: 40px; background: #1a1a2e; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; }
    h1 { color: #9c27b0; }
    .version { background: #9c27b0; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }
    input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #333; border-radius: 4px; background: #16213e; color: #fff; }
    button { width: 100%; padding: 12px; margin-top: 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    .cta { background: #9c27b0; color: #fff; }
    .cta:hover { background: #ba68c8; }
    .result { margin-top: 20px; padding: 12px; background: #00d26a; border-radius: 4px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <span class="version">V4: aria-label Only</span>
    <h1>Sign In</h1>
    <p>Button has: aria-label="Log in to your account", class="cta", text="Sign In"</p>
    <form onsubmit="return handleSubmit()">
      <input type="email" placeholder="Email" value="test@example.com">
      <input type="password" placeholder="Password" value="secret123">
      <button type="submit" aria-label="Log in to your account" class="cta">Sign In</button>
    </form>
    <div class="result" id="result">Login successful!</div>
  </div>
  <script>
    function handleSubmit() {
      document.getElementById('result').style.display = 'block';
      return false;
    }
  </script>
</body>
</html>`,

  // V5: Only text content remains similar
  v5: `<!DOCTYPE html>
<html>
<head>
  <title>Healing Test V5 - Text Only</title>
  <style>
    body { font-family: sans-serif; padding: 40px; background: #1a1a2e; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; }
    h1 { color: #ff5722; }
    .version { background: #ff5722; padding: 4px 12px; border-radius: 4px; display: inline-block; margin-bottom: 20px; }
    input { width: 100%; padding: 12px; margin: 8px 0; border: 1px solid #333; border-radius: 4px; background: #16213e; color: #fff; }
    button { width: 100%; padding: 12px; margin-top: 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; background: #ff5722; color: #fff; }
    button:hover { background: #ff8a65; }
    .result { margin-top: 20px; padding: 12px; background: #00d26a; border-radius: 4px; display: none; }
  </style>
</head>
<body>
  <div class="container">
    <span class="version">V5: Text Only</span>
    <h1>Authentication</h1>
    <p>Button has: NO id, NO data-testid, NO aria-label, just text "Login"</p>
    <form onsubmit="return handleSubmit()">
      <input type="email" placeholder="Email" value="test@example.com">
      <input type="password" placeholder="Password" value="secret123">
      <button type="submit">Login</button>
    </form>
    <div class="result" id="result">Login successful!</div>
  </div>
  <script>
    function handleSubmit() {
      document.getElementById('result').style.display = 'block';
      return false;
    }
  </script>
</body>
</html>`,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const version = url.pathname.replace('/', '') || 'v1';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');

  if (pages[version]) {
    res.writeHead(200);
    res.end(pages[version]);
  } else if (url.pathname === '/') {
    // Index page listing all versions
    res.writeHead(200);
    res.end(`<!DOCTYPE html>
<html>
<head><title>Healing Test Server</title>
<style>body{font-family:sans-serif;padding:40px;background:#1a1a2e;color:#fff;}a{color:#e94560;}</style>
</head>
<body>
<h1>Healing Test Server</h1>
<ul>
  <li><a href="/v1">V1: Original</a> - id="login-btn", class="btn-primary"</li>
  <li><a href="/v2">V2: ID Removed</a> - class="btn-login" only</li>
  <li><a href="/v3">V3: data-testid</a> - data-testid="login-button"</li>
  <li><a href="/v4">V4: aria-label</a> - aria-label="Log in to your account"</li>
  <li><a href="/v5">V5: Text Only</a> - just text "Login"</li>
</ul>
</body>
</html>`);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              HEALING TEST SERVER                              ║
╠══════════════════════════════════════════════════════════════╣
║  http://localhost:${PORT}/v1  - Original (id="login-btn")       ║
║  http://localhost:${PORT}/v2  - ID Removed (class only)         ║
║  http://localhost:${PORT}/v3  - data-testid="login-button"      ║
║  http://localhost:${PORT}/v4  - aria-label only                 ║
║  http://localhost:${PORT}/v5  - Text content only               ║
╚══════════════════════════════════════════════════════════════╝
`);
});
