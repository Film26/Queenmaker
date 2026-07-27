// api/auth/me.js - Vercel serverless function (also mounted directly in server.js for local dev).
const { getUserFromRequest } = require('../../lib/session');

module.exports = async function handler(req, res) {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.status(200).json({ user });
};
