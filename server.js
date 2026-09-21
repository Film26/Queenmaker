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
const usersHandler = require('./api/users/index');
app.get('/api/users', usersHandler);
app.put('/api/users', usersHandler);
// Same function as /api/users (see that file's header comment for why) - mirrors
// vercel.json's rewrite of this path to /api/users?resource=access-requests.
app.get('/api/access-requests', (req, res) => { req.query.resource = 'access-requests'; usersHandler(req, res); });
app.post('/api/access-requests', (req, res) => { req.query.resource = 'access-requests'; usersHandler(req, res); });
const auditLogHandler = require('./api/audit/log');
app.get('/api/audit/log', auditLogHandler);
app.post('/api/audit/log', auditLogHandler);
const kpiHandler = require('./api/kpi/index');
app.get('/api/kpi', kpiHandler);
app.put('/api/kpi', kpiHandler);
app.delete('/api/kpi', kpiHandler);
const configHandler = require('./api/config/index');
app.get('/api/config', configHandler);
app.put('/api/config', configHandler);
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
