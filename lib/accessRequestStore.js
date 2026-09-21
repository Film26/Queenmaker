// lib/accessRequestStore.js
// Backs the "request access" flow for Google sign-in (see api/auth/google/[action].js and
// api/access-requests/index.js): a Google account with no matching row in `users` creates a
// pending row here instead of being let in or silently rejected - a Super Admin then
// approves (creates the real user) or rejects it from Settings.
const crypto = require('crypto');
const db = require('./db');

function rowToRequest(row) {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by
  };
}

async function findPendingByEmail(email) {
  if (!db.isConnected) return null;
  const { rows } = await db.query(
    `SELECT * FROM access_requests WHERE email = $1 AND status = 'pending' LIMIT 1`,
    [email]
  );
  return rows[0] ? rowToRequest(rows[0]) : null;
}

async function create(email, name, orgId) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot record access request');
  if (!orgId) throw new Error('orgId is required');
  const id = 'req_' + crypto.randomBytes(12).toString('hex');
  const { rows } = await db.query(
    `INSERT INTO access_requests (id, email, name, status, org_id) VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
    [id, email, name || null, orgId]
  );
  return rowToRequest(rows[0]);
}

// Only the given organization's pending requests - another org's Super Admins never see them.
async function listPending(orgId) {
  if (!db.isConnected) return [];
  if (!orgId) throw new Error('orgId is required');
  const { rows } = await db.query(`SELECT * FROM access_requests WHERE status = 'pending' AND org_id = $1 ORDER BY created_at ASC`, [orgId]);
  return rows.map(rowToRequest);
}

// Only moves a row out of 'pending' - a second decision on the same id (e.g. two Super
// Admins clicking Approve/Reject around the same time) fails instead of double-applying.
async function decide(id, status, decidedBy, orgId) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot update access request');
  if (!orgId) throw new Error('orgId is required');
  const { rows } = await db.query(
    `UPDATE access_requests SET status = $2, decided_at = now(), decided_by = $3
     WHERE id = $1 AND status = 'pending' AND org_id = $4 RETURNING *`,
    [id, status, decidedBy || null, orgId]
  );
  if (!rows[0]) throw new Error('คำขอนี้ถูกดำเนินการไปแล้ว หรือไม่พบคำขอ');
  return rowToRequest(rows[0]);
}

module.exports = { findPendingByEmail, create, listPending, decide };
