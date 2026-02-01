/**
 * Golden Girl Fixtures Server
 *
 * Serves controlled test fixtures for golden test case validation.
 */

import express from 'express';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const app = express() as any;
app.use(express.json());

// =============================================================================
// HEALING FIXTURES
// =============================================================================

// Fixture: ID changes to class
app.get('/fixture/healing-id-to-class', (req: any, res: any) => {
  const variant = req.query.variant || 'before';

  if (variant === 'before') {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <button id="login-btn" data-testid="login">Login</button>
      </body></html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <button class="login-btn" data-testid="login">Login</button>
      </body></html>
    `);
  }
});

// Fixture: Class renamed
app.get('/fixture/healing-class-renamed', (req: any, res: any) => {
  const variant = req.query.variant || 'before';

  if (variant === 'before') {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <button class="btn-submit primary">Submit</button>
      </body></html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <button class="button-primary action-submit">Submit</button>
      </body></html>
    `);
  }
});

// Fixture: Element moved in DOM
app.get('/fixture/healing-element-moved', (req: any, res: any) => {
  const variant = req.query.variant || 'before';

  if (variant === 'before') {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <div class="header">
          <button id="submit" aria-label="Submit form">Submit</button>
        </div>
        <div class="footer"></div>
      </body></html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <div class="header"></div>
        <div class="footer">
          <button id="submit" aria-label="Submit form">Submit</button>
        </div>
      </body></html>
    `);
  }
});

// Fixture: Text changed
app.get('/fixture/healing-text-changed', (req: any, res: any) => {
  const variant = req.query.variant || 'before';

  if (variant === 'before') {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <button class="action-btn">Add to Cart</button>
      </body></html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Healing Test</title></head>
      <body>
        <button class="action-btn">Add to Basket</button>
      </body></html>
    `);
  }
});

// =============================================================================
// A11Y FIXTURES
// =============================================================================

// Fixture: Missing alt text
app.get('/fixture/a11y-missing-alt', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>A11y Test</title></head>
    <body>
      <img src="cat.jpg">
      <img src="dog.jpg" alt="">
      <img src="bird.jpg" alt="A colorful bird">
    </body></html>
  `);
});

// Fixture: Low contrast
app.get('/fixture/a11y-low-contrast', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>A11y Test</title>
    <style>
      .bad { color: #999; background: #aaa; padding: 10px; }
      .good { color: #000; background: #fff; padding: 10px; }
    </style>
    </head>
    <body>
      <p class="bad">This text has poor contrast</p>
      <p class="good">This text has good contrast</p>
    </body></html>
  `);
});

// Fixture: Missing form labels
app.get('/fixture/a11y-missing-labels', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>A11y Test</title></head>
    <body>
      <form>
        <input type="text" placeholder="Name">
        <label><input type="email"> Email</label>
        <label for="phone">Phone</label>
        <input type="tel" id="phone">
      </form>
    </body></html>
  `);
});

// Fixture: Keyboard trap
app.get('/fixture/a11y-keyboard-trap', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>A11y Test</title></head>
    <body>
      <input type="text" id="trapped" onkeydown="return false;">
      <button>Can't reach me with keyboard</button>
    </body></html>
  `);
});

// =============================================================================
// RCA FIXTURES
// =============================================================================

// Fixture: Selector changed
app.get('/fixture/rca-selector-changed', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html><head><title>RCA Test</title></head>
    <body>
      <button class="new-submit-btn">Submit</button>
    </body></html>
  `);
});

// Fixture: Slow load
app.get('/fixture/rca-slow-load', async (_req: any, res: any) => {
  await new Promise(r => setTimeout(r, 5000));
  res.send(`
    <!DOCTYPE html>
    <html><head><title>RCA Test</title></head>
    <body>
      <div class="loaded">Finally loaded!</div>
    </body></html>
  `);
});

// Fixture: Network error
app.get('/fixture/rca-network-error', (_req: any, res: any) => {
  res.status(500).send('Internal Server Error');
});

// =============================================================================
// NL AUTHORING FIXTURES
// =============================================================================

// Fixture: Simple login page
app.get('/fixture/login', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Login</title></head>
    <body>
      <h1>Login</h1>
      <form id="login-form">
        <input type="email" id="email" name="email" placeholder="Email" aria-label="Email">
        <input type="password" id="password" name="password" placeholder="Password" aria-label="Password">
        <button type="submit" id="submit-btn">Sign In</button>
      </form>
      <div id="error" class="error-message" style="display:none;">Invalid credentials</div>
      <div id="success" class="success-message" style="display:none;">Welcome!</div>
      <script>
        document.getElementById('login-form').onsubmit = (e) => {
          e.preventDefault();
          const pass = document.getElementById('password').value;
          if (pass === 'correct') {
            document.getElementById('success').style.display = 'block';
            document.getElementById('error').style.display = 'none';
          } else {
            document.getElementById('error').style.display = 'block';
            document.getElementById('success').style.display = 'none';
          }
        };
      </script>
    </body>
    </html>
  `);
});

// Fixture: Contact form
app.get('/fixture/contact', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Contact Us</title></head>
    <body>
      <h1>Contact Us</h1>
      <form id="contact-form">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" required>
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required>
        <label for="message">Message</label>
        <textarea id="message" name="message" required></textarea>
        <button type="submit">Send Message</button>
      </form>
      <div id="success" style="display:none;">Message sent!</div>
      <div id="error" style="display:none;">Please fill all fields</div>
    </body>
    </html>
  `);
});

// Fixture: E-commerce checkout
app.get('/fixture/checkout', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Checkout</title></head>
    <body>
      <h1>Checkout</h1>
      <div class="cart-summary">
        <div class="item">Product 1 - $10.00</div>
        <div class="total">Total: $10.00</div>
      </div>
      <form id="checkout-form">
        <label for="card">Card Number</label>
        <input type="text" id="card" name="card" placeholder="4242 4242 4242 4242">
        <label for="expiry">Expiry</label>
        <input type="text" id="expiry" name="expiry" placeholder="MM/YY">
        <label for="cvv">CVV</label>
        <input type="text" id="cvv" name="cvv" placeholder="123">
        <button type="submit" id="pay-btn">Pay Now</button>
      </form>
      <div id="success" style="display:none;">Payment successful!</div>
      <div id="error" style="display:none;">Payment failed</div>
    </body>
    </html>
  `);
});

// Fixture: Search and filter
app.get('/fixture/search', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Search</title></head>
    <body>
      <h1>Product Search</h1>
      <input type="text" id="search" placeholder="Search products..." aria-label="Search">
      <select id="category">
        <option value="">All Categories</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
      </select>
      <button id="search-btn">Search</button>
      <div id="results">
        <div class="product" data-category="electronics">Laptop - $999</div>
        <div class="product" data-category="electronics">Phone - $599</div>
        <div class="product" data-category="clothing">T-Shirt - $29</div>
      </div>
      <div id="no-results" style="display:none;">No products found</div>
    </body>
    </html>
  `);
});

// =============================================================================
// AI GENERATION FIXTURES
// =============================================================================

// Fixture: Multi-page app
app.get('/fixture/app', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Test App</title></head>
    <body>
      <nav>
        <a href="/fixture/app/dashboard">Dashboard</a>
        <a href="/fixture/app/settings">Settings</a>
        <a href="/fixture/app/profile">Profile</a>
      </nav>
      <main>
        <h1>Welcome to Test App</h1>
        <p>This is a multi-page application for testing AI generation.</p>
        <button id="get-started">Get Started</button>
      </main>
    </body>
    </html>
  `);
});

app.get('/fixture/app/dashboard', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Dashboard</title></head>
    <body>
      <nav><a href="/fixture/app">Home</a></nav>
      <h1>Dashboard</h1>
      <div class="stats">
        <div class="stat">Users: 1,234</div>
        <div class="stat">Revenue: $5,678</div>
      </div>
    </body>
    </html>
  `);
});

app.get('/fixture/app/settings', (_req: any, res: any) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><title>Settings</title></head>
    <body>
      <nav><a href="/fixture/app">Home</a></nav>
      <h1>Settings</h1>
      <form>
        <label><input type="checkbox" id="notifications"> Enable notifications</label>
        <label><input type="checkbox" id="darkmode"> Dark mode</label>
        <button type="submit">Save</button>
      </form>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (_req: any, res: any) => {
  res.json({ status: 'ok', service: 'golden-fixtures' });
});

// List available fixtures
app.get('/fixtures', (_req: any, res: any) => {
  res.json({
    healing: [
      '/fixture/healing-id-to-class',
      '/fixture/healing-class-renamed',
      '/fixture/healing-element-moved',
      '/fixture/healing-text-changed',
    ],
    a11y: [
      '/fixture/a11y-missing-alt',
      '/fixture/a11y-low-contrast',
      '/fixture/a11y-missing-labels',
      '/fixture/a11y-keyboard-trap',
    ],
    rca: [
      '/fixture/rca-selector-changed',
      '/fixture/rca-slow-load',
      '/fixture/rca-network-error',
    ],
    'nl-authoring': [
      '/fixture/login',
      '/fixture/contact',
      '/fixture/checkout',
      '/fixture/search',
    ],
    'ai-generation': [
      '/fixture/app',
      '/fixture/app/dashboard',
      '/fixture/app/settings',
    ],
  });
});

/**
 * Start the fixtures server
 */
export function startFixtureServer(port: number = 4444): Promise<void> {
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`Golden Girl fixtures running on http://localhost:${port}`);
      console.log(`Available fixtures: http://localhost:${port}/fixtures`);
      resolve();
    });
  });
}

// Run if called directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const port = parseInt(process.argv[2] || '4444', 10);
  startFixtureServer(port);
}

export { app };
