#!/usr/bin/env npx tsx
/**
 * PurlPal - A "Legacy" Social Media App for Knitting
 * 
 * Tech Stack Simulation: 
 * - Server-Side Rendered (SSR) HTML
 * - jQuery for interactions
 * - Form submissions for data
 * 
 * Purpose:
 * - Provide a contrast to the "Modern SPA" FakeSaaS
 * - Test different selector strategies (no data-test-id, messy DOM)
 * - Test race conditions on voting
 */

import http from 'http';
import { parse } from 'url';
import { StringDecoder } from 'string_decoder';

const PORT = 4001; // Distinct from FakeSaaS (4000)

// =============================================================================
// Data Store (In-Memory)
// =============================================================================

interface User {
  id: string;
  username: string;
  isAdmin: boolean;
}

interface Post {
  id: string;
  author: string;
  content: string;
  pattern: string; // The "image" (ascii art or text)
  votes: number;
  comments: string[];
}

const USERS: Record<string, User> = {
  'knit_queen': { id: 'u1', username: 'knit_queen', isAdmin: true },
  'yarn_noob': { id: 'u2', username: 'yarn_noob', isAdmin: false },
};

let POSTS: Post[] = [
  {
    id: 'p1',
    author: 'knit_queen',
    content: 'Check out my new scarf pattern! #cozy',
    pattern: '🧣 ~~~ ~~~ ~~~',
    votes: 42,
    comments: ['Love it!', 'So warm!']
  },
  {
    id: 'p2',
    author: 'yarn_noob',
    content: 'Help! I dropped a stitch. What do?',
    pattern: '🧶 ... ? ...',
    votes: -5,
    comments: ['Git gud', 'Try a crochet hook']
  }
];

const SESSIONS = new Map<string, string>(); // sessionId -> username

// =============================================================================
// HTML Templates (The "Legacy" Vibe)
// =============================================================================

const CSS = `
  <style>
    body { font-family: 'Georgia', serif; background: #fdf6e3; color: #586e75; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; border: 1px solid #d3d3d3; padding: 20px; box-shadow: 5px 5px 0px #eee; }
    h1 { color: #b58900; font-family: 'Courier New', monospace; border-bottom: 2px dashed #b58900; padding-bottom: 10px; }
    .btn { background: #2aa198; color: white; border: none; padding: 5px 10px; cursor: pointer; font-family: sans-serif; }
    .btn:hover { background: #268bd2; }
    .btn-vote { background: transparent; color: #586e75; border: 1px solid #ccc; font-weight: bold; }
    .post { border: 1px solid #eee; padding: 15px; margin-bottom: 15px; position: relative; }
    .post-header { font-size: 0.9em; color: #93a1a1; margin-bottom: 5px; }
    .pattern { font-family: monospace; background: #eee8d5; padding: 10px; margin: 10px 0; white-space: pre; }
    .actions { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
    .login-box { border: 2px solid #b58900; padding: 20px; max-width: 400px; margin: 50px auto; text-align: center; }
    input, textarea { width: 100%; padding: 8px; margin: 5px 0; border: 1px solid #ccc; box-sizing: border-box; }
    .flash { background: #859900; color: white; padding: 10px; margin-bottom: 15px; text-align: center; display: none; }
    .error { background: #dc322f; color: white; padding: 10px; margin-bottom: 15px; text-align: center; display: none; }
    
    /* Intentionally bad ID for testing selectors */
    #submit_btn_final_v2_real { font-weight: bold; } 
  </style>
  <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
`;

const LAYOUT = (content: string, user?: User) => `
<!DOCTYPE html>
<html>
<head>
  <title>PurlPal - Social Knitting</title>
  ${CSS}
</head>
<body>
  <div class="container">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <h1>🧶 PurlPal</h1>
      <div>
        ${user ? `<span>Hello, <b>${user.username}</b></span> | <a href="/logout">Logout</a>` : '<a href="/login">Login</a>'}
      </div>
    </div>
    
    <div id="flash-msg" class="flash"></div>
    <div id="error-msg" class="error"></div>
    
    ${content}
    
    <div style="margin-top: 50px; text-align: center; font-size: 0.8em; color: #ccc;">
      &copy; 2012 PurlPal Inc. | <a href="#">Terms</a> | <a href="#">Privacy</a>
    </div>
  </div>
  
  <script>
    // Global error handler for "observability" to catch
    window.onerror = function(msg, url, line) {
      console.error('[PurlPal Error] ' + msg); 
    };
    
    // Simulate some jQuery "spaghetti"
    $(document).ready(function() {
      if (window.location.search.includes('error')) {
        $('#error-msg').text('Something went wrong!').show();
      }
      
      $('.btn-vote').click(function(e) {
        e.preventDefault();
        var $btn = $(this);
        var pid = $btn.data('id');
        var type = $btn.hasClass('up') ? 'up' : 'down';
        
        // Intentional "Optimistic UI" bug: Update UI before server response
        // But sometimes server fails, leading to UI/Server mismatch (Drift)
        var $count = $btn.siblings('.vote-count');
        var current = parseInt($count.text());
        $count.text(type === 'up' ? current + 1 : current - 1);
        
        $.post('/vote', { id: pid, type: type }, function(resp) {
          if (!resp.success) {
            // Revert on failure (but delayed, causing confusion)
            setTimeout(function() {
                $count.text(current);
                alert('Vote failed!');
            }, 1000);
          }
        }).fail(function() {
           $count.text(current); // Revert immediately on net error
        });
      });
    });
  </script>
</body>
</html>
`;

// =============================================================================
// Pages
// =============================================================================

function renderLogin() {
  return LAYOUT(`
    <div class="login-box">
      <h2>Member Login</h2>
      <form action="/login" method="POST">
        <input type="text" name="username" placeholder="Username (try: knit_queen)" required><br>
        <input type="password" name="password" placeholder="Password (any)" required><br>
        <button type="submit" class="btn" id="submit_btn_final_v2_real">Enter the Circle</button>
      </form>
    </div>
  `);
}

function renderFeed(user: User) {
  const postHtml = POSTS.map(p => `
    <div class="post" id="post-${p.id}">
      <div class="post-header">Posted by <a href="/u/${p.author}">${p.author}</a></div>
      <div class="post-content">${p.content}</div>
      <div class="pattern">${p.pattern}</div>
      <div class="actions">
        <button class="btn-vote up" data-id="${p.id}">▲</button>
        <span class="vote-count" id="votes-${p.id}">${p.votes}</span>
        <button class="btn-vote down" data-id="${p.id}">▼</button>
        ${user.isAdmin ? `<form action="/delete" method="POST" style="display:inline"><input type="hidden" name="id" value="${p.id}"><button class="btn" style="background:#dc322f; font-size:0.8em">Delete</button></form>` : ''}
      </div>
    </div>
  `).join('');

  return LAYOUT(`
    <div style="background: #eee8d5; padding: 15px; margin-bottom: 20px;">
      <h3>New Pattern</h3>
      <form action="/post" method="POST">
        <textarea name="content" placeholder="Describe your creation..." rows="2"></textarea>
        <textarea name="pattern" placeholder="ASCII Art Pattern..." rows="3" style="font-family:monospace"></textarea>
        <button type="submit" class="btn">Share Pattern</button>
      </form>
    </div>
    
    <div id="feed">
      ${postHtml}
    </div>
  `, user);
}

// =============================================================================
// Server Logic
// =============================================================================

const server = http.createServer((req, res) => {
  const url = parse(req.url || '/', true);
  const method = req.method;
  
  // Session handling
  const cookies = req.headers.cookie || '';
  const sid = cookies.split(';').find(c => c.trim().startsWith('purl_sid='))?.split('=')[1];
  const username = sid ? SESSIONS.get(sid) : undefined;
  const user = username ? USERS[username] : undefined;

  // Body Parsing Helper
  const collectBody = (cb: (data: any) => void) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try {
            // Handle both JSON (for AJAX) and Form Data
            if (req.headers['content-type'] === 'application/json') {
                cb(JSON.parse(body));
            } else {
                // Simple form parser
                const data: Record<string, string> = {};
                body.split('&').forEach(pair => {
                    const [key, val] = pair.split('=');
                    data[decodeURIComponent(key)] = decodeURIComponent(val || '').replace(/\+/g, ' ');
                });
                cb(data);
            }
        } catch (e) { cb({}); }
    });
  };

  // --- ROUTES ---

  if (method === 'GET') {
    if (url.pathname === '/') {
        if (!user) {
            res.writeHead(302, { 'Location': '/login' });
            res.end();
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderFeed(user));
    } else if (url.pathname === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(renderLogin());
    } else if (url.pathname === '/logout') {
        if (sid) SESSIONS.delete(sid);
        res.writeHead(302, { 'Location': '/login', 'Set-Cookie': 'purl_sid=; Max-Age=0' });
        res.end();
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
  } 
  
  else if (method === 'POST') {
    if (url.pathname === '/login') {
        collectBody((data) => {
            if (USERS[data.username]) {
                const newSid = Math.random().toString(36).substring(2);
                SESSIONS.set(newSid, data.username);
                res.writeHead(302, { 'Location': '/', 'Set-Cookie': `purl_sid=${newSid}; HttpOnly` });
            } else {
                res.writeHead(302, { 'Location': '/login?error=1' });
            }
            res.end();
        });
    } else if (url.pathname === '/post') {
        if (!user) return res.end('Unauthorized');
        collectBody((data) => {
            POSTS.unshift({
                id: 'p' + Date.now(),
                author: user.username,
                content: data.content,
                pattern: data.pattern,
                votes: 0,
                comments: []
            });
            // Intentional slow server response to test "Waiting" logic
            setTimeout(() => {
                res.writeHead(302, { 'Location': '/' });
                res.end();
            }, 800);
        });
    } else if (url.pathname === '/vote') {
        if (!user) return res.end('Unauthorized');
        collectBody((data) => {
            // Intentional Flakiness: 20% chance of 500 Error
            if (Math.random() < 0.2) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Database locked' }));
                return;
            }
            
            const post = POSTS.find(p => p.id === data.id);
            if (post) {
                if (data.type === 'up') post.votes++;
                else post.votes--;
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, newCount: post.votes }));
            } else {
                res.writeHead(404);
                res.end();
            }
        });
    } else if (url.pathname === '/delete') {
        if (!user || !user.isAdmin) return res.end('Unauthorized');
        collectBody((data) => {
             POSTS = POSTS.filter(p => p.id !== data.id);
             res.writeHead(302, { 'Location': '/' });
             res.end();
        });
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🧶 PurlPal running at http://0.0.0.0:${PORT}`);
    console.log(`   Admin: knit_queen`);
    console.log(`   User:  yarn_noob`);
});
