// lib/auditLog.js
// Minimal append-only audit trail (login/logout/export/download events - Task 7).
// Stored in Postgres (see lib/db.js) - no writable local disk on Vercel.
const db = require('./db');
const emailNotify = require('./emailNotify');

// opts.strict: throw instead of swallowing a failed write - used for exports, where an
// unrecorded download must not be allowed to go ahead.
async function append(entry, opts) {
  const full = Object.assign({ ts: new Date().toISOString() }, entry);
  const strict = !!(opts && opts.strict);
  if (!db.isConnected) {
    console.error('[auditLog] No Postgres database connected - audit entry dropped:', full);
    if (strict) throw new Error('No Postgres database connected');
  } else {
    try {
      await db.query('INSERT INTO audit_log (ts, type, data) VALUES ($1,$2,$3)', [full.ts, full.type, JSON.stringify(full)]);
    } catch (e) {
      console.error('[auditLog] Failed to write audit entry:', e.message);
      if (strict) throw e;
    }
  }
  // Fire-and-forget: a slow/down email API must never delay or fail whatever request
  // triggered this audit entry (login, note save, etc.) - see lib/emailNotify.js.
  emailNotify.notify(full);
}

// Newest-first list of data_export entries for the Settings > Export Log tab.
async function listExports(limit) {
  const { rows } = await db.query(
    "SELECT id, ts, data FROM audit_log WHERE type = 'data_export' ORDER BY ts DESC, id DESC LIMIT $1",
    [limit]
  );
  return rows.map(r => ({
    id: r.id,
    ts: new Date(r.ts).toISOString(),
    username: r.data.username || '',
    role: r.data.role || '',
    page: r.data.page || '',
    group: r.data.group || '',
    filters: r.data.filters || {},
    rowCount: r.data.rowCount,
    sheets: r.data.sheets || [],
    fileName: r.data.fileName || '',
    ip: r.data.ip || ''
  }));
}

// Exports made by someone other than `excludeUserId` since `sinceIso` (null = ever) - drives the
// unseen-exports badge on the Settings menu.
async function countExportsByOthers(sinceIso, excludeUserId) {
  const { rows } = await db.query(
    "SELECT COUNT(*)::int AS n FROM audit_log WHERE type = 'data_export' " +
    "AND ($1::timestamptz IS NULL OR ts > $1::timestamptz) " +
    "AND (data->>'userId') IS DISTINCT FROM $2::text",
    [sinceIso, excludeUserId == null ? null : String(excludeUserId)]
  );
  return rows[0].n;
}

module.exports = { append, listExports, countExportsByOthers };
