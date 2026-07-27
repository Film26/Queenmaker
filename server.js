const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// The same handler modules Vercel calls as serverless functions (api/**) are mounted
// here directly for local development, so behavior is identical on both platforms -
// see lib/session.js for why no express-session/session-store is needed.
app.post('/api/auth/login', require('./api/auth/login'));
app.post('/api/auth/logout', require('./api/auth/logout'));
app.get('/api/auth/me', require('./api/auth/me'));
app.get('/api/users', require('./api/users/index'));
app.put('/api/users', require('./api/users/index'));
app.post('/api/audit/log', require('./api/audit/log'));

// Route guard: dashboard.html (and the Inside Hub tab inside it) requires login.
// Registered before express.static so it takes priority over the plain static file match
// (mirrors vercel.json's rewrite of the same path to the same handler).
app.get('/dashboard.html', require('./api/dashboard-guard'));

// Serve public static files at root
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/page2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'page2.html'));
});

app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
