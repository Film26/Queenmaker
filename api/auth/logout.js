// api/auth/logout.js - Vercel serverless function (also mounted directly in server.js for local dev).
const auditLog = require('../../lib/auditLog');
const { getUserFromRequest, clearSessionCookie } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = getUserFromRequest(req);
  if (user) {
    await auditLog.append({ type: 'logout', userId: user.id, username: user.username, ip: getClientIp(req) });
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(200).json({ ok: true });
};
