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
// One handler module for both routes, mirroring Vercel's api/auth/google/[action].js
// dynamic-route file - Express has no [param].js filename convention, so the :action
// route param is copied onto req.query.action here to match what that module expects.
const googleAuthHandler = require('./api/auth/google/[action]');
app.get('/api/auth/google/:action', (req, res) => {
  req.query.action = req.params.action;
  googleAuthHandler(req, res);
});
app.get('/api/users', require('./api/users/index'));
app.put('/api/users', require('./api/users/index'));
app.post('/api/audit/log', require('./api/audit/log'));
app.get('/api/discord/config', require('./api/discord/config'));
app.put('/api/discord/config', require('./api/discord/config'));
app.get('/api/notes', require('./api/notes/index'));
app.put('/api/notes', require('./api/notes/index'));
app.get('/api/notes/status-options', require('./api/notes/status-options'));
app.put('/api/notes/status-options', require('./api/notes/status-options'));

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
