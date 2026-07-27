// api/dashboard-guard.js - Vercel serverless function.
// Route guard for /dashboard.html (Task 7: prevent direct URL access without login).
// vercel.json rewrites /dashboard.html to this function instead of serving the static
// file directly, since Vercel's static hosting has no built-in per-file auth check.
const fs = require('fs');
const path = require('path');
const { getUserFromRequest } = require('../lib/session');

module.exports = async function handler(req, res) {
  const user = getUserFromRequest(req);
  if (!user) {
    res.writeHead(302, { Location: '/' });
    return res.end();
  }
  const html = fs.readFileSync(path.join(process.cwd(), 'public', 'dashboard.html'), 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
