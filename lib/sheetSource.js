// lib/sheetSource.js
// Google Sheet linked to an org's dataset ('main' / 'retention', see lib/datasetStore.js) - the
// link is remembered (org_sheet_sources in lib/schema.sql) and the server re-reads the sheet so the
// dashboard always shows its latest contents, for every role, without anyone importing again.
//
// The server (not the browser) reads the sheet so Manager/Sales Admin don't need access to it:
//   - a regular sheet link, through the Google service account (lib/googleServiceAccount.js) - the
//     sheet stays Restricted and is shared with the service account's email as Viewer;
//   - a "Publish to web" link, as its public CSV;
//   - an Apps Script web app link (/exec, e.g. the InsightHub script), as its JSON.
// syncDataset is called by the dashboard on open and every minute while it stays open (see
// /api/data action=sync); it claims the source for ~a minute so concurrent viewers don't re-read
// the same sheet, and for regular sheets skips the download when Drive says it hasn't changed.
// Rows are tagged with their admin name (public/admin-name.js) so a Sales Admin still gets only
// their own rows.
const db = require('./db');
const datasetStore = require('./datasetStore');
const serviceAccount = require('./googleServiceAccount');
const adminName = require('../public/admin-name');

const SYNC_INTERVAL_SECONDS = 55;
const SYNC_USER = 'Google Sheet (อัปเดตอัตโนมัติ)';

class SheetError extends Error {}

// -> { kind: 'sheet', id, gid } | { kind: 'published', url } | { kind: 'appsScript', url }
function parseLink(link) {
  const text = String(link || '').trim();
  if (text.length > 2048) throw new SheetError('ลิงก์ยาวเกินไป');
  if (/^https:\/\/script\.google\.com\/(?:a\/macros\/[^/\s]+|macros)\/s\/[\w-]+\/exec(?:\?\S*)?$/.test(text)) {
    const url = new URL(text);
    if (!url.searchParams.has('action')) url.searchParams.set('action', 'orders');
    return { kind: 'appsScript', url: url.toString() };
  }
  const m = text.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/(e\/)?([\w-]+)/);
  if (!m) throw new SheetError('ลิงก์ไม่ถูกต้อง กรุณาวางลิงก์ Google Sheet');
  const gidMatch = text.match(/[#?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : null;
  if (m[1]) return { kind: 'published', url: 'https://docs.google.com/spreadsheets/d/e/' + m[2] + '/pub?output=csv' + (gid ? '&gid=' + gid : '') };
  return { kind: 'sheet', id: m[2], gid };
}

// Header row + data rows -> row objects, the same shape the dashboard gets from a CSV file:
// duplicate headers become name_1, name_2 (like PapaParse), blank header cells are dropped,
// fully empty rows are skipped.
function valuesToRows(values) {
  if (!values.length) return [];
  const seen = {};
  const keys = values[0].map(h => {
    const name = String(h === undefined || h === null ? '' : h).trim();
    if (!name) return '';
    if (seen[name] === undefined) { seen[name] = 0; return name; }
    seen[name]++;
    return name + '_' + seen[name];
  });
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = {};
    let hasValue = false;
    keys.forEach((k, c) => {
      if (!k) return;
      const v = values[r][c] === undefined || values[r][c] === null ? '' : String(values[r][c]);
      if (v.trim() !== '') hasValue = true;
      row[k] = v;
    });
    if (hasValue) rows.push(row);
  }
  return rows;
}

// Minimal RFC 4180 CSV parser (quoted fields, "" escapes, newlines inside quotes).
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function googleError(res) {
  const body = await res.json().catch(() => ({}));
  const err = body.error || {};
  const detail = JSON.stringify(err.details || []) + ' ' + (err.message || '');
  const email = serviceAccount.serviceAccountEmail();
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/.test(detail)) return new SheetError('ยังไม่ได้เปิด Google Sheets API ในโปรเจกต์ของ Service Account');
  if (/not supported for this document/.test(detail)) return new SheetError('ลิงก์นี้เป็นไฟล์ Excel ใน Google Drive กรุณาเปิดไฟล์แล้วเลือก File > Save as Google Sheets ก่อน');
  if (res.status === 403 || res.status === 404) return new SheetError('เปิดชีตไม่ได้ กรุณาตรวจลิงก์ และแชร์ชีตให้ ' + (email || 'Service Account') + ' (สิทธิ์ Viewer)');
  return new SheetError('อ่านชีตไม่สำเร็จ (' + res.status + ')');
}

// Drive's modifiedTime of a regular sheet, or null when it can't be read (e.g. the Drive API isn't
// enabled) - then the sheet is simply downloaded every time.
async function sheetModifiedTime(id, token) {
  try {
    const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?fields=modifiedTime&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) return null;
    return (await res.json()).modifiedTime || null;
  } catch (e) {
    return null;
  }
}

async function readSheet(link, lastModified) {
  if (link.kind === 'appsScript') {
    let data;
    try {
      data = await (await fetch(link.url)).json();
    } catch (e) {
      throw new SheetError('เชื่อม Apps Script ไม่ได้ กรุณาตรวจลิงก์ และตั้ง Who has access เป็น Anyone');
    }
    if (data && data.success && Array.isArray(data.rows)) {
      const headers = [];
      data.rows.forEach(r => Object.keys(r || {}).forEach(k => { if (headers.indexOf(k) === -1) headers.push(k); }));
      return { values: [headers].concat(data.rows.map(r => headers.map(h => (r[h] === undefined || r[h] === null ? '' : r[h])))), modified: null };
    }
    if (data && data.ok && Array.isArray(data.values)) return { values: data.values, modified: null };
    throw new SheetError(data && data.error ? 'Apps Script: ' + data.error : 'เชื่อม Apps Script ไม่ได้ กรุณาตรวจลิงก์ และตั้ง Who has access เป็น Anyone');
  }
  if (link.kind === 'published') {
    const res = await fetch(link.url).catch(() => null);
    if (!res || !res.ok || (res.headers.get('content-type') || '').indexOf('text/csv') === -1) throw new SheetError('เปิดชีตที่เผยแพร่ (Publish to web) ไม่ได้ กรุณาตรวจลิงก์');
    return { values: parseCsv(await res.text()), modified: null };
  }

  const token = await serviceAccount.getAccessToken();
  const modified = await sheetModifiedTime(link.id, token);
  if (modified && modified === lastModified) return { unchanged: true, modified };
  const api = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(link.id);
  const get = async url => {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw await googleError(res);
    return res.json();
  };
  const meta = await get(api + '?fields=sheets.properties(sheetId,title)');
  const tabs = (meta.sheets || []).map(s => s.properties);
  const tab = link.gid === null ? tabs[0] : tabs.find(p => String(p.sheetId) === link.gid);
  if (!tab) throw new SheetError('ไม่พบแท็บที่อยู่ในลิงก์ กรุณาเปิดแท็บที่ต้องการแล้วคัดลอกลิงก์ใหม่');
  // FORMATTED_VALUE = ค่าตามที่เห็นในชีต (วันที่/เบอร์โทรไม่เปลี่ยนรูป) เหมือนดาวน์โหลดเป็น CSV
  const data = await get(api + '/values/' + encodeURIComponent("'" + tab.title.replace(/'/g, "''") + "'") + '?valueRenderOption=FORMATTED_VALUE');
  return { values: data.values || [], modified };
}

async function getSource(orgId, dataset) {
  const { rows } = await db.query(
    'SELECT url, last_synced_at, last_error, updated_by, updated_at FROM org_sheet_sources WHERE org_id = $1 AND dataset = $2',
    [orgId, dataset]
  );
  const r = rows[0];
  return r ? { url: r.url, lastSyncedAt: r.last_synced_at, lastError: r.last_error || '', updatedBy: r.updated_by || '', updatedAt: r.updated_at } : null;
}

async function setSource(orgId, dataset, url, updatedBy) {
  await db.query(
    `INSERT INTO org_sheet_sources (org_id, dataset, url, updated_by, updated_at) VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (org_id, dataset) DO UPDATE SET url = EXCLUDED.url, updated_by = EXCLUDED.updated_by, updated_at = now(),
       last_checked_at = NULL, last_synced_at = NULL, source_modified = NULL, last_error = NULL`,
    [orgId, dataset, url, updatedBy || '']
  );
}

async function removeSource(orgId, dataset) {
  await db.query('DELETE FROM org_sheet_sources WHERE org_id = $1 AND dataset = $2', [orgId, dataset]);
}

// Re-reads the linked sheet into the dataset. -> { status: 'none' | 'skipped' | 'unchanged' | 'updated' | 'error', error?, manifest? }
// Without `force`, a source checked within SYNC_INTERVAL_SECONDS is skipped (the claim is one atomic UPDATE,
// so many viewers polling at once read the sheet only once).
async function syncDataset(orgId, dataset, { force } = {}) {
  if (datasetStore.DATASETS.indexOf(dataset) === -1) throw new Error('Unknown dataset');
  const { rows } = await db.query(
    `UPDATE org_sheet_sources SET last_checked_at = now()
     WHERE org_id = $1 AND dataset = $2 AND ($3 OR last_checked_at IS NULL OR last_checked_at < now() - make_interval(secs => $4))
     RETURNING url, source_modified`,
    [orgId, dataset, !!force, SYNC_INTERVAL_SECONDS]
  );
  if (!rows[0]) return { status: (await getSource(orgId, dataset)) ? 'skipped' : 'none' };
  const { url, source_modified: lastModified } = rows[0];

  try {
    const current = await datasetStore.getManifest(orgId, dataset);
    const result = await readSheet(parseLink(url), current ? lastModified : null);
    if (result.unchanged) {
      await db.query('UPDATE org_sheet_sources SET last_synced_at = now(), last_error = NULL WHERE org_id = $1 AND dataset = $2', [orgId, dataset]);
      return { status: 'unchanged' };
    }
    const sheetRows = valuesToRows(result.values);
    if (!sheetRows.length) throw new SheetError('ชีตไม่มีแถวข้อมูล (แถวแรกต้องเป็นหัวคอลัมน์)');
    const admins = sheetRows.map(row => (dataset === 'retention' ? adminName.retentionAdmin(row) : adminName.normalizeAdmin(row)) || '');
    let manifest;
    try {
      manifest = await datasetStore.saveRows(orgId, dataset, sheetRows, admins, { baseVersion: current ? current.version : null, sourceName: 'Google Sheet', updatedBy: SYNC_USER });
    } catch (e) {
      // someone imported/synced in between - their data is newer than ours, the next sync picks the sheet up again
      if (e instanceof datasetStore.VersionConflictError) return { status: 'skipped' };
      throw e;
    }
    await db.query(
      'UPDATE org_sheet_sources SET last_synced_at = now(), source_modified = $3, last_error = NULL WHERE org_id = $1 AND dataset = $2',
      [orgId, dataset, result.modified]
    );
    return { status: 'updated', manifest };
  } catch (e) {
    const message = e instanceof SheetError ? e.message : 'ดึงข้อมูลจากชีตไม่สำเร็จ (' + e.message + ')';
    if (!(e instanceof SheetError)) console.error('[sheetSource] sync failed:', e);
    await db.query('UPDATE org_sheet_sources SET last_error = $3 WHERE org_id = $1 AND dataset = $2', [orgId, dataset, message.slice(0, 500)]);
    return { status: 'error', error: message };
  }
}

module.exports = { SheetError, parseLink, valuesToRows, parseCsv, getSource, setSource, removeSource, syncDataset };
