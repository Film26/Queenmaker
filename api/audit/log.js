// api/audit/log.js - Vercel serverless function (also mounted directly in server.js for local dev).
// POST: records a client-triggered data export (called by the dashboard's Export Data button
//       right before it generates the file - the download is blocked if this call fails).
// GET:  Super Admin only - lists recent exports / counts unseen ones for the Settings > Export Log tab.
// Kept as one file for both verbs so it stays a single Vercel function (plan function limit).
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

const EXPORT_ROLES = ['Super Admin', 'Manager'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sanitizeExportDetail(detail) {
  const d = detail && typeof detail === 'object' ? detail : {};
  const filters = {};
  if (d.filters && typeof d.filters === 'object') {
    Object.keys(d.filters).slice(0, 12).forEach(k => {
      filters[str(k, 30)] = str(String(d.filters[k]), 80);
    });
  }
  const rowCount = Number.isFinite(d.rowCount) ? Math.max(0, Math.min(Math.trunc(d.rowCount), 10000000)) : 0;
  return {
    page: str(d.page, 40),
    group: str(d.group, 80),
    filters,
    rowCount,
    sheets: Array.isArray(d.sheets) ? d.sheets.slice(0, 12).map(s => str(String(s), 60)) : [],
    fileName: str(d.fileName, 160)
  };
}

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    if (sessionUser.role !== 'Super Admin') {
      auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      if (req.query && req.query.countOnly) {
        const since = req.query.since && !isNaN(Date.parse(req.query.since)) ? new Date(req.query.since).toISOString() : null;
        return res.status(200).json({ count: await auditLog.countExportsByOthers(since, sessionUser.id, sessionUser.orgId) });
      }
      const limit = Math.max(1, Math.min(parseInt(req.query && req.query.limit, 10) || 200, 500));
      return res.status(200).json({ entries: await auditLog.listExports(limit, sessionUser.orgId) });
    } catch (e) {
      console.error('[audit/log] GET failed:', e.message);
      return res.status(500).json({ error: 'โหลดบันทึกการ Export ไม่สำเร็จ' });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Only data_export may be written from the browser - accepting arbitrary types would let any
  // logged-in user forge audit entries (e.g. fake users_updated / login_failed records).
  const { type, detail } = req.body || {};
  if (type !== 'data_export') return res.status(400).json({ error: 'Unsupported event type' });

  if (EXPORT_ROLES.indexOf(sessionUser.role) === -1) {
    auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await auditLog.append(Object.assign(
      { type: 'data_export', orgId: sessionUser.orgId, userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, ip: getClientIp(req) },
      sanitizeExportDetail(detail)
    ), { strict: true });
  } catch (e) {
    return res.status(503).json({ error: 'บันทึกประวัติการ Export ไม่สำเร็จ' });
  }
  res.status(200).json({ ok: true });
};
