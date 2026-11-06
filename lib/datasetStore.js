// lib/datasetStore.js
// Server-side store for the data imported on the Dashboard (Import Data), one dataset per
// organization and kind ('main' / 'retention' - see org_datasets in lib/schema.sql). Previously
// imported rows only lived in the importing browser tab, so nobody else saw them and a reload
// lost them. Now Super Admin/CEO import once and every user of the org loads the same data.
//
// Each import uploads a complete new version in chunks (addChunk) and then switches the org's
// pointer to it (commit) - the old version's chunks are deleted only after the switch, so a
// reader mid-download either finishes the old version or gets a version-changed error and
// reloads. Chunks are stored gzip-compressed as { rows, admins }: `admins[i]` is the admin name
// the importing browser resolved for rows[i] (the Dashboard's own getNormalizedAdmin /
// retAdminName), which is what lets the API send a Sales Admin only their own rows.
// `orgId` always comes from the server-verified session, never from the request.
//
// Imported data is deliberately short-lived (to limit what could leak from the database): all of an
// org's data is cleared whenever a Super Admin/CEO opens the dashboard (clearOrg), a
// dataset is deleted when the person who last imported it logs out (deleteImportedBy, called by
// api/auth/logout.js) and in any case RETENTION_HOURS after that import (purgeExpired, run on
// every manifest read) - so after logging out and back in, data has to be imported again.
const zlib = require('zlib');
const db = require('./db');

const DATASETS = ['main', 'retention'];
// Roles that may import (and export) data - everyone else in the org only views it.
const IMPORT_ROLES = ['Super Admin', 'CEO'];
const VERSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_CHUNK_CHARS = 4 * 1024 * 1024;
const MAX_CHUNKS = 500;
const RETENTION_HOURS = 8;

function assertDataset(dataset) {
  if (DATASETS.indexOf(dataset) === -1) throw new Error('Unknown dataset');
}

function assertVersion(version) {
  if (typeof version !== 'string' || !VERSION_RE.test(version)) throw new Error('Invalid version');
}

// Rows are the imported spreadsheet rows: plain objects whose values are strings (or empty).
function cleanChunk(rows, admins) {
  if (!Array.isArray(rows) || !Array.isArray(admins) || rows.length !== admins.length) throw new Error('rows and admins must be lists of the same length');
  rows.forEach(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Each row must be an object');
    Object.keys(row).forEach(k => {
      const v = row[k];
      if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new Error('Row values must be text');
    });
  });
  const json = JSON.stringify({ rows, admins: admins.map(a => (a === null || a === undefined ? '' : String(a))) });
  if (json.length > MAX_CHUNK_CHARS) throw new Error('Chunk is too large');
  return json;
}

// Every org's datasets past RETENTION_HOURS, plus chunks no dataset points at any more (expired
// versions and uploads abandoned for over an hour - newer ones may still be uploading).
async function purgeExpired() {
  await db.query('DELETE FROM org_datasets WHERE updated_at < now() - make_interval(hours => $1)', [RETENTION_HOURS]);
  await db.query(
    `DELETE FROM org_dataset_chunks c WHERE c.created_at < now() - interval '1 hour'
       AND NOT EXISTS (SELECT 1 FROM org_datasets d WHERE d.version = c.version)`
  );
}

// Deletes every dataset of the org (and any upload in progress) - called each time a Super Admin/CEO
// opens the dashboard, so nobody starts from data left over from an earlier session.
async function clearOrg(orgId) {
  if (!db.isConnected || !orgId) return [];
  const { rows } = await db.query('DELETE FROM org_datasets WHERE org_id = $1 RETURNING dataset', [orgId]);
  await db.query('DELETE FROM org_dataset_chunks WHERE org_id = $1', [orgId]);
  return rows.map(r => r.dataset);
}

// Deletes the datasets this user imported last (on logout) - returns which ones were removed.
async function deleteImportedBy(orgId, username) {
  if (!db.isConnected || !orgId || !username) return [];
  const { rows } = await db.query('DELETE FROM org_datasets WHERE org_id = $1 AND updated_by = $2 RETURNING dataset, version', [orgId, username]);
  if (rows.length) await db.query('DELETE FROM org_dataset_chunks WHERE version = ANY($1)', [rows.map(r => r.version)]);
  return rows.map(r => r.dataset);
}

async function getManifest(orgId, dataset) {
  assertDataset(dataset);
  if (!db.isConnected) return null;
  await purgeExpired();
  const { rows } = await db.query(
    'SELECT version, row_count, chunk_count, source_name, updated_at, updated_by FROM org_datasets WHERE org_id = $1 AND dataset = $2',
    [orgId, dataset]
  );
  const r = rows[0];
  return r ? { version: r.version, rowCount: r.row_count, chunkCount: r.chunk_count, sourceName: r.source_name || '', updatedAt: r.updated_at, updatedBy: r.updated_by || '' } : null;
}

async function addChunk(orgId, dataset, version, index, rows, admins) {
  assertDataset(dataset);
  assertVersion(version);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) throw new Error('Invalid chunk index');
  const data = zlib.gzipSync(cleanChunk(rows, admins));
  // a retried chunk replaces itself, but only within the same org+dataset - a version id that
  // happens to belong to another org is left untouched (and commit then reports the upload incomplete)
  await db.query(
    `INSERT INTO org_dataset_chunks (version, idx, org_id, dataset, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (version, idx) DO UPDATE SET data = EXCLUDED.data
       WHERE org_dataset_chunks.org_id = EXCLUDED.org_id AND org_dataset_chunks.dataset = EXCLUDED.dataset`,
    [version, index, orgId, dataset, data]
  );
}

class VersionConflictError extends Error {}

// Switches the org's dataset to `version` if it is still based on `baseVersion` (the version the
// importer had loaded - null when there was none), so two people importing at once can't
// silently drop each other's rows. Old and abandoned versions are cleaned up afterwards.
async function commit(orgId, dataset, version, { chunkCount, rowCount, baseVersion, sourceName, updatedBy }) {
  assertDataset(dataset);
  assertVersion(version);
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > MAX_CHUNKS) throw new Error('Invalid chunk count');
  if (!Number.isInteger(rowCount) || rowCount < 0) throw new Error('Invalid row count');
  const { rows: have } = await db.query(
    'SELECT count(*)::int AS n FROM org_dataset_chunks WHERE version = $1 AND org_id = $2 AND dataset = $3 AND idx < $4',
    [version, orgId, dataset, chunkCount]
  );
  if (have[0].n !== chunkCount) throw new Error('Upload is incomplete');

  const current = await getManifest(orgId, dataset);
  if ((current ? current.version : null) !== (baseVersion || null)) throw new VersionConflictError('Dataset changed');

  const { rowCount: switched } = await db.query(
    `INSERT INTO org_datasets (org_id, dataset, version, row_count, chunk_count, source_name, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, now(), $7)
     ON CONFLICT (org_id, dataset) DO UPDATE SET version = EXCLUDED.version, row_count = EXCLUDED.row_count,
       chunk_count = EXCLUDED.chunk_count, source_name = EXCLUDED.source_name, updated_at = now(), updated_by = EXCLUDED.updated_by
       WHERE org_datasets.version IS NOT DISTINCT FROM $8`,
    [orgId, dataset, version, rowCount, chunkCount, String(sourceName || '').slice(0, 200), updatedBy || '', baseVersion || null]
  );
  if (!switched) throw new VersionConflictError('Dataset changed');

  // everything of this org+dataset that isn't the new version: the previous version, and uploads
  // that were started but never committed
  await db.query('DELETE FROM org_dataset_chunks WHERE org_id = $1 AND dataset = $2 AND version <> $3', [orgId, dataset, version]);
  return getManifest(orgId, dataset);
}

async function readChunk(orgId, dataset, version, index) {
  assertDataset(dataset);
  assertVersion(version);
  const { rows } = await db.query(
    'SELECT data FROM org_dataset_chunks WHERE version = $1 AND idx = $2 AND org_id = $3 AND dataset = $4',
    [version, index, orgId, dataset]
  );
  if (!rows[0]) return null;
  return JSON.parse(zlib.gunzipSync(rows[0].data).toString('utf8'));
}

module.exports = { DATASETS, IMPORT_ROLES, RETENTION_HOURS, VersionConflictError, getManifest, addChunk, commit, readChunk, deleteImportedBy, clearOrg };
