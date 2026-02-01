/**
 * Hell Extension Test Server
 *
 * Serves test pages on multiple ports to simulate different domains.
 * This is critical for testing tab state isolation.
 *
 * Usage:
 *   node server.js
 *
 * Pages:
 *   - http://localhost:6660/page-a.html (Port A)
 *   - http://localhost:6661/page-b.html (Port B)
 *   - http://localhost:6662/page-c.html (Port C)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORTS = {
  A: 6660,
  B: 6661,
  C: 6662
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function createServer(port, defaultPage) {
  const server = http.createServer((req, res) => {
    let filePath = req.url === '/' ? `/${defaultPage}` : req.url;
    filePath = path.join(__dirname, filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // Try index
          if (!ext) {
            fs.readFile(path.join(filePath, 'index.html'), (err2, content2) => {
              if (err2) {
                res.writeHead(404);
                res.end(`404 Not Found: ${req.url}`);
              } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content2);
              }
            });
          } else {
            res.writeHead(404);
            res.end(`404 Not Found: ${req.url}`);
          }
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${err.code}`);
        }
      } else {
        // Add CORS headers for extension access
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        });
        res.end(content);
      }
    });
  });

  server.listen(port, () => {
    console.log(`[Hell Server] Port ${port} serving ${defaultPage}`);
  });

  return server;
}

// Create servers for each test page
const servers = [
  createServer(PORTS.A, 'page-a.html'),
  createServer(PORTS.B, 'page-b.html'),
  createServer(PORTS.C, 'page-c.html')
];

console.log(`
╔══════════════════════════════════════════════════════════════╗
║                   HELL EXTENSION TEST SERVER                  ║
╠══════════════════════════════════════════════════════════════╣
║  Page Alpha (Red)   →  http://localhost:${PORTS.A}/page-a.html    ║
║  Page Beta (Green)  →  http://localhost:${PORTS.B}/page-b.html    ║
║  Page Gamma (Yellow)→  http://localhost:${PORTS.C}/page-c.html    ║
╠══════════════════════════════════════════════════════════════╣
║  All pages available on all ports (for flexibility)          ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Hell Server] Shutting down...');
  servers.forEach(s => s.close());
  process.exit(0);
});
