// api/auth/logout.js - Vercel serverless function (also mounted directly in server.js for local dev).
const auditLog = require('../../lib/auditLog');
const datasetStore = require('../../lib/datasetStore');
const { getUserFromRequest, getAuthorizedUser, clearSessionCookie } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = getUserFromRequest(req);
  if (user) {
    await auditLog.append({ type: 'logout', userId: user.id, username: user.username, ip: getClientIp(req) });
    // Imported data must not outlive its importer's session: delete what this user imported
    // (see lib/datasetStore.js). A failure here never blocks the logout - the 8-hour expiry
    // still removes it.
    try {
      const live = await getAuthorizedUser(req);
      if (live && datasetStore.IMPORT_ROLES.indexOf(live.role) !== -1) {
        const cleared = await datasetStore.deleteImportedBy(live.orgId, live.username);
        if (cleared.length) await auditLog.append({ type: 'data_cleared', reason: 'logout', orgId: live.orgId, userId: live.id, username: live.username, datasets: cleared, ip: getClientIp(req) });
      }
    } catch (e) {
      console.error('[logout] Failed to clear imported data:', e.message);
    }
  }
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(200).json({ ok: true });
};
