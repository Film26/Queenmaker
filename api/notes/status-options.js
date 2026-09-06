// api/notes/status-options.js - Vercel serverless function (also mounted directly in
// server.js for local dev). Manages the configurable contact-status list used by Sales
// Note - read is open to any logged-in user (they need it to render the note editor),
// write is restricted to Super Admin/Manager (matches the "จัดการสถานะการติดต่อ" panel in
// Settings, mirroring api/users/index.js's Super-Admin-only write gate).
const statusOptionsStore = require('../../lib/statusOptionsStore');
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const options = await statusOptionsStore.loadStatusOptions();
    return res.status(200).json(options);
  }

  if (req.method === 'PUT') {
    if (sessionUser.role !== 'Super Admin' && sessionUser.role !== 'Manager') {
      auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const options = await statusOptionsStore.saveStatusOptions(req.body);
      await auditLog.append({ type: 'status_options_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req), count: options.length });
      return res.status(200).json(options);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
