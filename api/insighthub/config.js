// api/insighthub/config.js - Vercel serverless function (also mounted directly in server.js for local dev).
// InsightHub Google Apps Script connection settings - any logged-in user can read the
// configured URL (needed to load the tab), only Super Admin can change it.
const insightHubConfigStore = require('../../lib/insightHubConfigStore');
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const config = await insightHubConfigStore.loadConfig();
    return res.status(200).json(config);
  }

  if (req.method === 'PUT') {
    if (sessionUser.role !== 'Super Admin') {
      auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const { scriptUrl } = req.body || {};
      if (typeof scriptUrl !== 'string') return res.status(400).json({ error: 'scriptUrl is required' });
      const saved = await insightHubConfigStore.saveConfig({ scriptUrl, updatedBy: sessionUser.name || sessionUser.username });
      await auditLog.append({ type: 'insighthub_config_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req) });
      return res.status(200).json(saved);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
