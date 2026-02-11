#!/usr/bin/env bun
/**
 * FakeReddit - A Reddit-like app for E2E testing swarm QA
 *
 * Features:
 * - Admin users who approve/reject posts
 * - Regular users who submit posts
 * - Posts need admin approval to be visible
 * - Multiple roles for parallel agent testing
 *
 * Users:
 * - admin@fakereddit.com / admin123 (Admin)
 * - mod@fakereddit.com / mod123 (Moderator)
 * - user1@fakereddit.com / user123 (Regular user)
 * - user2@fakereddit.com / user123 (Regular user)
 */

const PORT = parseInt(process.env.PORT || '4001');

// Types
interface User {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'mod' | 'user';
  karma: number;
}

interface Post {
  id: string;
  title: string;
  content: string;
  author: string;
  authorEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  votes: number;
  createdAt: Date;
  reviewedBy?: string;
  reviewedAt?: Date;
  subreddit: string;
}

interface Comment {
  id: string;
  postId: string;
  content: string;
  author: string;
  authorEmail: string;
  votes: number;
  createdAt: Date;
}

// Database
const users = new Map<string, User>([
  ['admin@fakereddit.com', { email: 'admin@fakereddit.com', password: 'admin123', name: 'AdminUser', role: 'admin', karma: 10000 }],
  ['mod@fakereddit.com', { email: 'mod@fakereddit.com', password: 'mod123', name: 'ModeratorMike', role: 'mod', karma: 5000 }],
  ['user1@fakereddit.com', { email: 'user1@fakereddit.com', password: 'user123', name: 'RegularRick', role: 'user', karma: 150 }],
  ['user2@fakereddit.com', { email: 'user2@fakereddit.com', password: 'user123', name: 'NormalNancy', role: 'user', karma: 75 }],
]);

const posts: Post[] = [
  { id: 'post_1', title: 'Welcome to FakeReddit!', content: 'This is the first approved post.', author: 'AdminUser', authorEmail: 'admin@fakereddit.com', status: 'approved', votes: 42, createdAt: new Date(Date.now() - 86400000), subreddit: 'announcements' },
  { id: 'post_2', title: 'Check out this cool bug I found', content: 'Found a really interesting bug while testing...', author: 'RegularRick', authorEmail: 'user1@fakereddit.com', status: 'pending', votes: 0, createdAt: new Date(Date.now() - 3600000), subreddit: 'bugs' },
  { id: 'post_3', title: 'My first post here', content: 'Hello everyone! New to FakeReddit.', author: 'NormalNancy', authorEmail: 'user2@fakereddit.com', status: 'pending', votes: 0, createdAt: new Date(Date.now() - 1800000), subreddit: 'introductions' },
];

const comments: Comment[] = [
  { id: 'comment_1', postId: 'post_1', content: 'Great to be here!', author: 'RegularRick', authorEmail: 'user1@fakereddit.com', votes: 5, createdAt: new Date() },
];

const sessions = new Map<string, string>();
const subreddits = ['announcements', 'bugs', 'introductions', 'general', 'testing', 'memes'];

// Helpers
function genId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function getCookies(req: Request): Record<string, string> {
  const cookie = req.headers.get('cookie') || '';
  return cookie.split(';').reduce((acc, c) => {
    const [key, val] = c.trim().split('=');
    if (key && val) acc[key] = val;
    return acc;
  }, {} as Record<string, string>);
}

function getSession(req: Request): { user: User; email: string } | null {
  const cookies = getCookies(req);
  const sessionId = cookies['session'];
  if (!sessionId) return null;
  const email = sessions.get(sessionId);
  if (!email) return null;
  const user = users.get(email);
  if (!user) return null;
  return { user, email };
}

// Styles
const styles = `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, system-ui, sans-serif; background: #0e1113; color: #d7dadc; min-height: 100vh; }
  a { color: #4fbcff; text-decoration: none; }
  a:hover { text-decoration: underline; }

  .header { background: #1a1a1b; border-bottom: 1px solid #343536; padding: 8px 20px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; }
  .logo { font-size: 1.4em; font-weight: bold; color: #ff4500; display: flex; align-items: center; gap: 8px; }
  .nav { display: flex; gap: 16px; align-items: center; }
  .nav a { color: #d7dadc; font-size: 14px; }
  .user-info { display: flex; align-items: center; gap: 12px; }
  .karma { color: #ff4500; font-size: 12px; }
  .role-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .role-admin { background: #ff4500; color: white; }
  .role-mod { background: #46d160; color: white; }
  .role-user { background: #343536; color: #818384; }

  .container { max-width: 900px; margin: 0 auto; padding: 20px; }
  .sidebar { position: fixed; right: 20px; top: 80px; width: 250px; }

  .card { background: #1a1a1b; border: 1px solid #343536; border-radius: 8px; margin-bottom: 16px; }
  .card-header { padding: 12px 16px; border-bottom: 1px solid #343536; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
  .card-body { padding: 16px; }

  .post { background: #1a1a1b; border: 1px solid #343536; border-radius: 8px; margin-bottom: 12px; display: flex; }
  .post:hover { border-color: #545454; }
  .vote-col { padding: 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; background: #161617; border-radius: 8px 0 0 8px; }
  .vote-btn { background: none; border: none; color: #818384; cursor: pointer; font-size: 18px; padding: 4px; }
  .vote-btn:hover { color: #ff4500; }
  .vote-btn.up:hover { color: #ff4500; }
  .vote-btn.down:hover { color: #7193ff; }
  .vote-count { font-size: 12px; font-weight: 600; }
  .post-content { flex: 1; padding: 8px 12px; }
  .post-meta { font-size: 12px; color: #818384; margin-bottom: 6px; }
  .post-title { font-size: 16px; font-weight: 500; margin-bottom: 6px; }
  .post-body { font-size: 14px; color: #b0b3b8; }
  .post-actions { display: flex; gap: 12px; margin-top: 8px; }
  .post-action { font-size: 12px; color: #818384; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
  .post-action:hover { background: #343536; }

  .status-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .status-pending { background: #ffc107; color: #000; }
  .status-approved { background: #46d160; color: white; }
  .status-rejected { background: #ff4500; color: white; }

  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; margin-bottom: 6px; font-size: 14px; color: #818384; }
  .form-group input, .form-group textarea, .form-group select { width: 100%; padding: 10px 12px; background: #272729; border: 1px solid #343536; border-radius: 6px; color: #d7dadc; font-size: 14px; }
  .form-group input:focus, .form-group textarea:focus { outline: none; border-color: #4fbcff; }
  .form-group textarea { min-height: 120px; resize: vertical; }

  .btn { padding: 10px 20px; border-radius: 20px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; }
  .btn-primary { background: #ff4500; color: white; }
  .btn-primary:hover { background: #ff5722; }
  .btn-secondary { background: #272729; color: #d7dadc; border: 1px solid #343536; }
  .btn-success { background: #46d160; color: white; }
  .btn-danger { background: #ff4500; color: white; }
  .btn-sm { padding: 6px 12px; font-size: 12px; }

  .auth-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: linear-gradient(135deg, #0e1113 0%, #1a1a1b 100%); }
  .auth-card { background: #1a1a1b; padding: 40px; border-radius: 12px; width: 100%; max-width: 400px; border: 1px solid #343536; }
  .auth-card h1 { text-align: center; margin-bottom: 24px; color: #ff4500; }

  .queue-item { display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid #343536; }
  .queue-item:last-child { border-bottom: none; }
  .queue-actions { display: flex; gap: 8px; }

  .tab-nav { display: flex; gap: 4px; margin-bottom: 16px; background: #272729; padding: 4px; border-radius: 8px; }
  .tab-btn { padding: 8px 16px; border-radius: 6px; font-size: 14px; cursor: pointer; background: none; border: none; color: #818384; }
  .tab-btn.active { background: #343536; color: #d7dadc; }

  .comment { padding: 12px; border-left: 2px solid #343536; margin: 8px 0 8px 16px; }
  .comment-meta { font-size: 12px; color: #818384; margin-bottom: 4px; }

  .empty { text-align: center; padding: 40px; color: #818384; }
  .toast { position: fixed; bottom: 20px; right: 20px; background: #1a1a1b; border: 1px solid #343536; padding: 12px 20px; border-radius: 8px; display: none; }
  .toast.show { display: block; animation: slideIn 0.3s; }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
</style>`;

// Pages
function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html><head><title>Login - FakeReddit</title>${styles}</head>
<body>
  <div class="auth-container">
    <div class="auth-card">
      <h1>🔴 FakeReddit</h1>
      ${error ? `<div style="background:#ff45001a;color:#ff4500;padding:12px;border-radius:6px;margin-bottom:16px">${error}</div>` : ''}
      <form method="POST" action="/login">
        <div class="form-group">
          <label>Email</label>
          <input type="email" name="email" placeholder="admin@fakereddit.com" required>
        </div>
        <div class="form-group">
          <label>Password</label>
          <input type="password" name="password" placeholder="admin123" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%">Log In</button>
      </form>
      <div style="margin-top:20px;font-size:12px;color:#818384">
        <p><b>Test accounts:</b></p>
        <p>Admin: admin@fakereddit.com / admin123</p>
        <p>Mod: mod@fakereddit.com / mod123</p>
        <p>User: user1@fakereddit.com / user123</p>
      </div>
    </div>
  </div>
</body></html>`;
}

function feedPage(user: User, filter: string = 'all'): string {
  const visiblePosts = posts.filter(p => {
    if (user.role === 'admin' || user.role === 'mod') return true;
    return p.status === 'approved' || p.authorEmail === user.email;
  });

  const filteredPosts = filter === 'all' ? visiblePosts :
    filter === 'pending' ? visiblePosts.filter(p => p.status === 'pending') :
    filter === 'mine' ? visiblePosts.filter(p => p.authorEmail === user.email) :
    visiblePosts.filter(p => p.subreddit === filter);

  return `<!DOCTYPE html>
<html><head><title>FakeReddit</title>${styles}</head>
<body>
  <header class="header">
    <div class="logo">🔴 FakeReddit</div>
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/submit">Submit Post</a>
      ${user.role !== 'user' ? '<a href="/mod">Mod Queue</a>' : ''}
      ${user.role === 'admin' ? '<a href="/admin">Admin</a>' : ''}
    </nav>
    <div class="user-info">
      <span>${user.name}</span>
      <span class="karma">🔺 ${user.karma}</span>
      <span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span>
      <a href="/logout" class="btn btn-secondary btn-sm">Logout</a>
    </div>
  </header>

  <div class="container">
    <div class="tab-nav">
      <button class="tab-btn ${filter === 'all' ? 'active' : ''}" onclick="location.href='/?filter=all'">All</button>
      <button class="tab-btn ${filter === 'mine' ? 'active' : ''}" onclick="location.href='/?filter=mine'">My Posts</button>
      ${user.role !== 'user' ? `<button class="tab-btn ${filter === 'pending' ? 'active' : ''}" onclick="location.href='/?filter=pending'">Pending</button>` : ''}
      ${subreddits.slice(0, 4).map(s => `<button class="tab-btn ${filter === s ? 'active' : ''}" onclick="location.href='/?filter=${s}'">r/${s}</button>`).join('')}
    </div>

    <div id="posts">
      ${filteredPosts.length === 0 ? '<div class="empty">No posts to show</div>' : ''}
      ${filteredPosts.map(post => `
        <div class="post" data-id="${post.id}">
          <div class="vote-col">
            <button class="vote-btn up" onclick="vote('${post.id}', 1)">▲</button>
            <span class="vote-count">${post.votes}</span>
            <button class="vote-btn down" onclick="vote('${post.id}', -1)">▼</button>
          </div>
          <div class="post-content">
            <div class="post-meta">
              <span class="status-badge status-${post.status}">${post.status}</span>
              r/${post.subreddit} • Posted by u/${post.author} • ${timeAgo(post.createdAt)}
              ${post.reviewedBy ? `• Reviewed by ${post.reviewedBy}` : ''}
            </div>
            <div class="post-title"><a href="/post/${post.id}">${post.title}</a></div>
            <div class="post-body">${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}</div>
            <div class="post-actions">
              <span class="post-action">💬 ${comments.filter(c => c.postId === post.id).length} Comments</span>
              <span class="post-action">↗️ Share</span>
              <span class="post-action">⭐ Save</span>
              ${(user.role !== 'user' && post.status === 'pending') ? `
                <span class="post-action" style="color:#46d160" onclick="moderate('${post.id}', 'approve')">✓ Approve</span>
                <span class="post-action" style="color:#ff4500" onclick="moderate('${post.id}', 'reject')">✗ Reject</span>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script>
    async function vote(postId, dir) {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, direction: dir })
      });
      if (res.ok) location.reload();
    }

    async function moderate(postId, action) {
      const res = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action })
      });
      if (res.ok) {
        showToast(action === 'approve' ? 'Post approved!' : 'Post rejected');
        setTimeout(() => location.reload(), 500);
      }
    }

    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }
  </script>
</body></html>`;
}

function submitPage(user: User, error?: string, success?: boolean): string {
  return `<!DOCTYPE html>
<html><head><title>Submit - FakeReddit</title>${styles}</head>
<body>
  <header class="header">
    <div class="logo">🔴 FakeReddit</div>
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/submit">Submit Post</a>
      ${user.role !== 'user' ? '<a href="/mod">Mod Queue</a>' : ''}
    </nav>
    <div class="user-info">
      <span>${user.name}</span>
      <span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span>
      <a href="/logout" class="btn btn-secondary btn-sm">Logout</a>
    </div>
  </header>

  <div class="container" style="max-width:600px">
    <div class="card">
      <div class="card-header">Create a post</div>
      <div class="card-body">
        ${error ? `<div style="background:#ff45001a;color:#ff4500;padding:12px;border-radius:6px;margin-bottom:16px">${error}</div>` : ''}
        ${success ? `<div style="background:#46d1601a;color:#46d160;padding:12px;border-radius:6px;margin-bottom:16px">Post submitted! It will be visible after moderator approval.</div>` : ''}
        <form method="POST" action="/submit">
          <div class="form-group">
            <label>Subreddit</label>
            <select name="subreddit" required>
              ${subreddits.map(s => `<option value="${s}">r/${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" placeholder="An interesting title" required maxlength="200">
          </div>
          <div class="form-group">
            <label>Content</label>
            <textarea name="content" placeholder="What's on your mind?" required></textarea>
          </div>
          <button type="submit" class="btn btn-primary">Submit Post</button>
          <p style="margin-top:12px;font-size:12px;color:#818384">
            ${user.role === 'user' ? '⚠️ Your post will need moderator approval before it becomes visible.' : '✓ As a moderator, your post will be auto-approved.'}
          </p>
        </form>
      </div>
    </div>
  </div>
</body></html>`;
}

function modQueuePage(user: User): string {
  const pendingPosts = posts.filter(p => p.status === 'pending');

  return `<!DOCTYPE html>
<html><head><title>Mod Queue - FakeReddit</title>${styles}</head>
<body>
  <header class="header">
    <div class="logo">🔴 FakeReddit</div>
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/submit">Submit Post</a>
      <a href="/mod">Mod Queue</a>
      ${user.role === 'admin' ? '<a href="/admin">Admin</a>' : ''}
    </nav>
    <div class="user-info">
      <span>${user.name}</span>
      <span class="role-badge role-${user.role}">${user.role.toUpperCase()}</span>
      <a href="/logout" class="btn btn-secondary btn-sm">Logout</a>
    </div>
  </header>

  <div class="container">
    <div class="card">
      <div class="card-header">
        <span>Moderation Queue</span>
        <span class="status-badge status-pending">${pendingPosts.length} pending</span>
      </div>
      <div class="card-body">
        ${pendingPosts.length === 0 ? '<div class="empty">🎉 All caught up! No posts pending review.</div>' : ''}
        ${pendingPosts.map(post => `
          <div class="queue-item">
            <div>
              <div style="font-weight:600">${post.title}</div>
              <div style="font-size:12px;color:#818384">by u/${post.author} in r/${post.subreddit} • ${timeAgo(post.createdAt)}</div>
              <div style="font-size:14px;margin-top:4px">${post.content.substring(0, 100)}...</div>
            </div>
            <div class="queue-actions">
              <button class="btn btn-success btn-sm" onclick="moderate('${post.id}', 'approve')">✓ Approve</button>
              <button class="btn btn-danger btn-sm" onclick="moderate('${post.id}', 'reject')">✗ Reject</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>
  <script>
    async function moderate(postId, action) {
      const res = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action })
      });
      if (res.ok) {
        showToast(action === 'approve' ? 'Post approved!' : 'Post rejected');
        setTimeout(() => location.reload(), 500);
      }
    }
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 3000);
    }
  </script>
</body></html>`;
}

function adminPage(user: User): string {
  return `<!DOCTYPE html>
<html><head><title>Admin - FakeReddit</title>${styles}</head>
<body>
  <header class="header">
    <div class="logo">🔴 FakeReddit</div>
    <nav class="nav">
      <a href="/">Home</a>
      <a href="/mod">Mod Queue</a>
      <a href="/admin">Admin</a>
    </nav>
    <div class="user-info">
      <span>${user.name}</span>
      <span class="role-badge role-admin">ADMIN</span>
      <a href="/logout" class="btn btn-secondary btn-sm">Logout</a>
    </div>
  </header>

  <div class="container">
    <div class="card">
      <div class="card-header">Admin Dashboard</div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
          <div style="background:#272729;padding:20px;border-radius:8px;text-align:center">
            <div style="font-size:32px;font-weight:bold;color:#ff4500">${users.size}</div>
            <div style="color:#818384">Total Users</div>
          </div>
          <div style="background:#272729;padding:20px;border-radius:8px;text-align:center">
            <div style="font-size:32px;font-weight:bold;color:#46d160">${posts.filter(p => p.status === 'approved').length}</div>
            <div style="color:#818384">Approved Posts</div>
          </div>
          <div style="background:#272729;padding:20px;border-radius:8px;text-align:center">
            <div style="font-size:32px;font-weight:bold;color:#ffc107">${posts.filter(p => p.status === 'pending').length}</div>
            <div style="color:#818384">Pending Review</div>
          </div>
        </div>

        <h3 style="margin-bottom:12px">All Users</h3>
        <table style="width:100%;border-collapse:collapse">
          <tr style="border-bottom:1px solid #343536"><th style="text-align:left;padding:8px">User</th><th>Email</th><th>Role</th><th>Karma</th><th>Actions</th></tr>
          ${Array.from(users.values()).map(u => `
            <tr style="border-bottom:1px solid #343536">
              <td style="padding:8px">${u.name}</td>
              <td>${u.email}</td>
              <td><span class="role-badge role-${u.role}">${u.role}</span></td>
              <td>🔺 ${u.karma}</td>
              <td><button class="btn btn-secondary btn-sm" ${u.role === 'admin' ? 'disabled' : ''}>Edit</button></td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  </div>
</body></html>`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

// Server
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Static routes
    if (path === '/health') {
      return Response.json({ status: 'ok', posts: posts.length, users: users.size, pending: posts.filter(p => p.status === 'pending').length });
    }

    // Auth routes
    if (path === '/login' && method === 'GET') {
      return new Response(loginPage(), { headers: { 'Content-Type': 'text/html' } });
    }

    if (path === '/login' && method === 'POST') {
      const form = await req.formData();
      const email = form.get('email') as string;
      const password = form.get('password') as string;
      const user = users.get(email);

      // Debug logging
      console.log('[FakeReddit] Login attempt:', { email, password, userFound: !!user, passwordMatch: user?.password === password });

      if (user && user.password === password) {
        const sid = genId();
        sessions.set(sid, email);
        return new Response(null, {
          status: 302,
          headers: { 'Location': '/', 'Set-Cookie': `session=${sid}; Path=/; HttpOnly` }
        });
      }
      return new Response(loginPage('Invalid email or password'), { headers: { 'Content-Type': 'text/html' } });
    }

    if (path === '/logout') {
      const cookies = getCookies(req);
      if (cookies.session) sessions.delete(cookies.session);
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/login', 'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0' }
      });
    }

    // Protected routes
    const session = getSession(req);
    if (!session) {
      return new Response(null, { status: 302, headers: { 'Location': '/login' } });
    }
    const { user } = session;

    // Feed
    if (path === '/' && method === 'GET') {
      const filter = url.searchParams.get('filter') || 'all';
      return new Response(feedPage(user, filter), { headers: { 'Content-Type': 'text/html' } });
    }

    // Submit post
    if (path === '/submit' && method === 'GET') {
      return new Response(submitPage(user), { headers: { 'Content-Type': 'text/html' } });
    }

    if (path === '/submit' && method === 'POST') {
      const form = await req.formData();
      const title = (form.get('title') as string || '').trim();
      const content = (form.get('content') as string || '').trim();
      const subreddit = form.get('subreddit') as string || 'general';

      if (!title || !content) {
        return new Response(submitPage(user, 'Title and content are required'), { headers: { 'Content-Type': 'text/html' } });
      }

      const post: Post = {
        id: 'post_' + genId(),
        title,
        content,
        author: user.name,
        authorEmail: user.email,
        status: user.role === 'user' ? 'pending' : 'approved',
        votes: 1,
        createdAt: new Date(),
        subreddit,
        reviewedBy: user.role !== 'user' ? user.name + ' (auto)' : undefined,
      };
      posts.unshift(post);

      return new Response(submitPage(user, undefined, true), { headers: { 'Content-Type': 'text/html' } });
    }

    // Mod queue
    if (path === '/mod') {
      if (user.role === 'user') {
        return new Response(null, { status: 302, headers: { 'Location': '/' } });
      }
      return new Response(modQueuePage(user), { headers: { 'Content-Type': 'text/html' } });
    }

    // Admin
    if (path === '/admin') {
      if (user.role !== 'admin') {
        return new Response(null, { status: 302, headers: { 'Location': '/' } });
      }
      return new Response(adminPage(user), { headers: { 'Content-Type': 'text/html' } });
    }

    // API: Vote
    if (path === '/api/vote' && method === 'POST') {
      const { postId, direction } = await req.json();
      const post = posts.find(p => p.id === postId);
      if (post) {
        post.votes += direction;
        return Response.json({ success: true, votes: post.votes });
      }
      return Response.json({ error: 'Post not found' }, { status: 404 });
    }

    // API: Moderate
    if (path === '/api/moderate' && method === 'POST') {
      if (user.role === 'user') {
        return Response.json({ error: 'Unauthorized' }, { status: 403 });
      }
      const { postId, action } = await req.json();
      const post = posts.find(p => p.id === postId);
      if (post) {
        post.status = action === 'approve' ? 'approved' : 'rejected';
        post.reviewedBy = user.name;
        post.reviewedAt = new Date();
        return Response.json({ success: true });
      }
      return Response.json({ error: 'Post not found' }, { status: 404 });
    }

    // API: Get posts (for testing)
    if (path === '/api/posts') {
      return Response.json({ posts, pending: posts.filter(p => p.status === 'pending').length });
    }

    return new Response('Not found', { status: 404 });
  }
});

console.log(`
╔════════════════════════════════════════════════════════════════╗
║                    FakeReddit Server                           ║
╠════════════════════════════════════════════════════════════════╣
║  URL: http://localhost:${PORT}                                     ║
║                                                                ║
║  Test Accounts:                                                ║
║  • Admin: admin@fakereddit.com / admin123                      ║
║  • Mod:   mod@fakereddit.com / mod123                          ║
║  • User:  user1@fakereddit.com / user123                       ║
║  • User:  user2@fakereddit.com / user123                       ║
║                                                                ║
║  Features:                                                     ║
║  • Users submit posts → go to pending queue                    ║
║  • Admins/Mods approve or reject posts                         ║
║  • Only approved posts visible on feed                         ║
║  • Perfect for testing parallel agent workflows                ║
╚════════════════════════════════════════════════════════════════╝
`);
