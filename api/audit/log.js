// api/audit/log.js - Vercel serverless function (also mounted directly in server.js for local dev).
// Generic audit endpoint for client-triggered events (Insight Hub export/download).
const auditLog = require('../../lib/auditLog');
const { getUserFromRequest } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionUser = getUserFromRequest(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  const { type, detail } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type is required' });

  await auditLog.append({ type, detail, userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req) });
  res.status(200).json({ ok: true });
};