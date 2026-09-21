// lib/kpiStore.js
// Server-side store for the KPI Setting page's targets, one row per organization (see the
// kpi_settings table in lib/schema.sql). Previously this lived in each browser's
// localStorage under a single un-scoped key, so every account that signed in on the same
// browser saw (and overwrote) the same targets. `orgId` always comes from the server-verified
// session (lib/session.js getAuthorizedUser), never from the request.
const db = require('./db');

async function loadKpi(orgId) {
  if (!db.isConnected) return null;
  if (!orgId) throw new Error('orgId is required');
  const { rows } = await db.query('SELECT data, updated_at, updated_by FROM kpi_settings WHERE org_id = $1', [orgId]);
  if (!rows[0]) return null;
  return { data: rows[0].data, updatedAt: rows[0].updated_at, updatedBy: rows[0].updated_by || '' };
}

async function saveKpi(orgId, data, updatedBy) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist KPI settings');
  if (!orgId) throw new Error('orgId is required');
  const { rows } = await db.query(
    `INSERT INTO kpi_settings (org_id, data, updated_at, updated_by)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (org_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now(), updated_by = EXCLUDED.updated_by
     RETURNING data, updated_at, updated_by`,
    [orgId, JSON.stringify(data), updatedBy || '']
  );
  return { data: rows[0].data, updatedAt: rows[0].updated_at, updatedBy: rows[0].updated_by || '' };
}

async function deleteKpi(orgId) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist KPI settings');
  if (!orgId) throw new Error('orgId is required');
  await db.query('DELETE FROM kpi_settings WHERE org_id = $1', [orgId]);
}

module.exports = { loadKpi, saveKpi, deleteKpi };
