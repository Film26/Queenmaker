// api/users/index.js - Vercel serverless function (also mounted directly in server.js for local dev).
// User management API - Super Admin only (Task 4: add/edit/delete/assign roles).
//
// Also answers /api/access-requests (?resource=access-requests, routed here by vercel.json's
// rewrite + the matching Express route in server.js) instead of living in its own file under
// api/ - this project's Vercel plan caps a deployment at 12 Serverless Functions, and
// api/auth/google/[action].js's file header explains the deploy that silently failed the
// last time a new file pushed the count to exactly that limit. Keeping this here avoids
// repeating that.
const userStore = require('../../lib/userStore');
const accessRequestStore = require('../../lib/accessRequestStore');
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });
  if (sessionUser.role !== 'Super Admin') {
    auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.query && req.query.resource === 'access-requests') {
    return handleAccessRequests(req, res, sessionUser);
  }

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

// Pending "request access" rows created by api/auth/google/[action].js when a Google
// sign-in doesn't match any existing user - a Super Admin reviews them from Settings and
// either approves (creates the real user via userStore.createUser) or rejects.
async function handleAccessRequests(req, res, sessionUser) {
  if (req.method === 'GET') {
    const list = await accessRequestStore.listPending();
    return res.status(200).json(list);
  }

  if (req.method === 'POST') {
    const { id, decision, role, adminName } = req.body || {};
    if (!id || (decision !== 'approve' && decision !== 'reject')) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    try {
      if (decision === 'reject') {
        const request = await accessRequestStore.decide(id, 'rejected', sessionUser.id);
        await auditLog.append({ type: 'access_request_rejected', userId: sessionUser.id, username: request.email, ip: getClientIp(req) });
        return res.status(200).json({ ok: true });
      }

      // approve: create the real user first and only mark the request decided once that
      // succeeds, so a failure (e.g. that email got added another way in the meantime)
      // leaves the request pending instead of "approved" with no matching user.
      const pending = await accessRequestStore.listPending();
      const request = pending.find(r => r.id === id);
      if (!request) return res.status(404).json({ error: 'ไม่พบคำขอนี้ หรือถูกดำเนินการไปแล้ว' });
      if (!role) return res.status(400).json({ error: 'กรุณาเลือก Role' });
      if (role === 'Sales Admin' && !adminName) return res.status(400).json({ error: 'กรุณาเลือกชื่อแอดมิน (Admin Name) สำหรับ Sales Admin' });

      const newUser = await userStore.createUser({ username: request.email, name: request.name || request.email, role, adminName });
      await accessRequestStore.decide(id, 'approved', sessionUser.id);
      await auditLog.append({ type: 'access_request_approved', userId: sessionUser.id, username: newUser.username, role, ip: getClientIp(req) });
      return res.status(200).json(newUser);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
