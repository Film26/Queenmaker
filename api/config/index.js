// api/config/index.js - Vercel serverless function (also mounted directly in server.js for local dev).
// Settings-page dropdown lists (Channel / SubChannel / Product / SubProduct / Admin), scoped to
// the signed-in user's organization (sessionUser.orgId, from lib/session.js) - there is
// deliberately no way to pass an org id in the request. Any logged-in user can read them (the
// Dashboard's filters and Product mapping need them); only a Super Admin can change them,
// matching who can open the Settings page.
const orgConfigStore = require('../../lib/orgConfigStore');
const auditLog = require('../../lib/auditLog');
const { DEFAULT_ORG_ID } = require('../../lib/orgStore');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const config = await orgConfigStore.loadConfig(sessionUser.orgId);
    // Only the default organization (the original deployment) starts out with the built-in
    // demo lists; every other org starts empty rather than seeing another customer's names.
    return res.status(200).json({ config, useDemoDefaults: sessionUser.orgId === DEFAULT_ORG_ID });
  }

  if (req.method === 'PUT') {
    if (sessionUser.role !== 'Super Admin') {
      auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const body = req.body || {};
      const config = await orgConfigStore.saveConfig(sessionUser.orgId, body.config);
      await auditLog.append({ type: 'settings_config_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req), categories: Object.keys(orgConfigStore.cleanConfig(body.config)) });
      return res.status(200).json({ config });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
