// api/users/index.js - Vercel serverless function (also mounted directly in server.js for local dev).
// User management API - Super Admin only (Task 4: add/edit/delete/assign roles).
const userStore = require('../../lib/userStore');
const auditLog = require('../../lib/auditLog');
const { getUserFromRequest } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = getUserFromRequest(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });
  if (sessionUser.role !== 'Super Admin') return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const users = await userStore.loadUsers();
    return res.status(200).json(users.map(userStore.sanitize));
  }

  // Bulk-sync endpoint matching public/settings.js's existing "resend the whole array"
  // pattern (stgSaveUserModal / stgToggleUserActive / stgDeleteUser) - no client rewrite needed.
  if (req.method === 'PUT') {
    try {
      const users = await userStore.syncUsers(Array.isArray(req.body) ? req.body : []);
      await auditLog.append({ type: 'users_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req), count: users.length });
      return res.status(200).json(users);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
