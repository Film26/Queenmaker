// api/kpi/index.js - Vercel serverless function (also mounted directly in server.js for local dev).
// KPI Setting API. Data is scoped to the signed-in user's organization (sessionUser.orgId, from
// lib/session.js) - there is deliberately no way to pass an org id in the request. Any logged-in
// user can read their org's targets (the Dashboard's KPI Compare badges need them); writing is
// limited to Super Admin/Manager, matching api/notes/status-options.js.
const kpiStore = require('../../lib/kpiStore');
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

const MAX_BODY_CHARS = 200 * 1024;

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const saved = await kpiStore.loadKpi(sessionUser.orgId);
    return res.status(200).json(saved ? { data: saved.data, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : { data: null });
  }

  if (req.method === 'PUT' || req.method === 'DELETE') {
    if (sessionUser.role !== 'Super Admin' && sessionUser.role !== 'Manager') {
      auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      if (req.method === 'DELETE') {
        await kpiStore.deleteKpi(sessionUser.orgId);
        await auditLog.append({ type: 'kpi_reset', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req) });
        return res.status(200).json({ ok: true });
      }

      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Invalid KPI data' });
      }
      if (JSON.stringify(body).length > MAX_BODY_CHARS) {
        return res.status(400).json({ error: 'KPI data is too large' });
      }
      // savedAt is stamped here, not trusted from the client (same rule as notes' updatedAt).
      const saved = await kpiStore.saveKpi(
        sessionUser.orgId,
        Object.assign({}, body, { savedAt: new Date().toISOString() }),
        sessionUser.name || sessionUser.username
      );
      await auditLog.append({ type: 'kpi_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req) });
      return res.status(200).json({ data: saved.data, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
