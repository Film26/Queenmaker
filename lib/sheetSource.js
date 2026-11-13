// lib/sheetSource.js
// Google Sheet linked to an org's dataset ('main' / 'retention', see lib/datasetStore.js) - the
// link is remembered (org_sheet_sources in lib/schema.sql) and the server re-reads the sheet so the
// dashboard always shows its latest contents, for every role, without anyone importing again.
//
// The server (not each viewer's browser) reads the sheet, so Manager/Sales Admin don't need access:
//   - a regular sheet link, with the Google permission of the Super Admin/CEO who linked it: they
//     sign in with Google when linking (api/auth/google/[action].js sheets-start), Google checks that
//     account can open the sheet, and its read-only refresh token is kept encrypted (lib/secretBox.js)
//     so the server can keep reading as that account - the sheet stays Restricted;
//   - a "Publish to web" link, as its public CSV;
//   - an Apps Script web app link (/exec, e.g. the InsightHub script), as its JSON.
// syncDataset is called by the dashboard on open and every minute while it stays open (see
// /api/data action=sync); it claims the source for ~a minute so concurrent viewers don't re-read
// the same sheet, and skips writing when the sheet's contents haven't changed. Rows are tagged with
// their admin name (public/admin-name.js) so a Sales Admin still gets only their own rows.
const crypto = require('crypto');
const db = require('./db');
const datasetStore = require('./datasetStore');
const secretBox = require('./secretBox');
const adminName = require('../public/admin-name');

const SYNC_INTERVAL_SECONDS = 55;
const SYNC_USER = 'Google Sheet (อัปเดตอัตโนมัติ)';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const LINK_REQUEST_MINUTES = 10;

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

// Access token of the account that linked the sheet, from its stored refresh token.
async function accessTokenFor(source) {
  let refreshToken;
  try {
    refreshToken = secretBox.decrypt(source.refreshToken);
  } catch (e) {
    throw new SheetError('สิทธิ์ Google ที่เก็บไว้ใช้ไม่ได้ กรุณาเชื่อมลิงก์ใหม่');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', refresh_token: refreshToken, grant_type: 'refresh_token' })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new SheetError('สิทธิ์ Google ของ ' + (source.googleEmail || 'บัญชีที่เชื่อมไว้') + ' หมดอายุหรือถูกยกเลิก กรุณาเชื่อมลิงก์ใหม่');
  }
  return data.access_token;
}

async function googleError(res, source) {
  const body = await res.json().catch(() => ({}));
  const err = body.error || {};
  const detail = JSON.stringify(err.details || []) + ' ' + (err.message || '');
  if (/SERVICE_DISABLED|accessNotConfigured|has not been used|is disabled/.test(detail)) return new SheetError('ยังไม่ได้เปิด Google Sheets API ในโปรเจกต์ Google Cloud ของระบบ');
  if (/not supported for this document/.test(detail)) return new SheetError('ลิงก์นี้เป็นไฟล์ Excel ใน Google Drive กรุณาเปิดไฟล์แล้วเลือก File > Save as Google Sheets ก่อน');
  if (res.status === 403 || res.status === 404) return new SheetError('บัญชี ' + (source.googleEmail || 'ที่เชื่อมไว้') + ' เปิดชีตนี้ไม่ได้ กรุณาตรวจลิงก์ หรือขอให้เจ้าของชีตแชร์ให้บัญชีนี้');
  return new SheetError('อ่านชีตไม่สำเร็จ (' + res.status + ')');
}

// -> values (header row first)
async function readSheet(link, source) {
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
      return [headers].concat(data.rows.map(r => headers.map(h => (r[h] === undefined || r[h] === null ? '' : r[h]))));
    }
    if (data && data.ok && Array.isArray(data.values)) return data.values;
    throw new SheetError(data && data.error ? 'Apps Script: ' + data.error : 'เชื่อม Apps Script ไม่ได้ กรุณาตรวจลิงก์ และตั้ง Who has access เป็น Anyone');
  }
  if (link.kind === 'published') {
    const res = await fetch(link.url).catch(() => null);
    if (!res || !res.ok || (res.headers.get('content-type') || '').indexOf('text/csv') === -1) throw new SheetError('เปิดชีตที่เผยแพร่ (Publish to web) ไม่ได้ กรุณาตรวจลิงก์');
    return parseCsv(await res.text());
  }

  if (!source.refreshToken) throw new SheetError('ลิงก์นี้ต้องเชื่อมด้วยบัญชี Google ที่เปิดชีตได้ กรุณาเชื่อมลิงก์ใหม่');
  const token = await accessTokenFor(source);
  const api = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(link.id);
  const get = async url => {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw await googleError(res, source);
    return res.json();
  };
  const meta = await get(api + '?fields=sheets.properties(sheetId,title)');
  const tabs = (meta.sheets || []).map(s => s.properties);
  const tab = link.gid === null ? tabs[0] : tabs.find(p => String(p.sheetId) === link.gid);
  if (!tab) throw new SheetError('ไม่พบแท็บที่อยู่ในลิงก์ กรุณาเปิดแท็บที่ต้องการแล้วคัดลอกลิงก์ใหม่');
  // FORMATTED_VALUE = ค่าตามที่เห็นในชีต (วันที่/เบอร์โทรไม่เปลี่ยนรูป) เหมือนดาวน์โหลดเป็น CSV
  const data = await get(api + '/values/' + encodeURIComponent("'" + tab.title.replace(/'/g, "''") + "'") + '?valueRenderOption=FORMATTED_VALUE');
  return data.values || [];
}

async function getSource(orgId, dataset) {
  const { rows } = await db.query(
    'SELECT url, google_email, last_synced_at, last_error, updated_by, updated_at FROM org_sheet_sources WHERE org_id = $1 AND dataset = $2',
    [orgId, dataset]
  );
  const r = rows[0];
  return r ? { url: r.url, googleEmail: r.google_email || '', lastSyncedAt: r.last_synced_at, lastError: r.last_error || '', updatedBy: r.updated_by || '', updatedAt: r.updated_at } : null;
}

// googleAccount: { email, refreshToken } of the account that authorized a regular sheet link
async function setSource(orgId, dataset, url, updatedBy, googleAccount) {
  await db.query(
    `INSERT INTO org_sheet_sources (org_id, dataset, url, updated_by, updated_at, google_email, refresh_token) VALUES ($1, $2, $3, $4, now(), $5, $6)
     ON CONFLICT (org_id, dataset) DO UPDATE SET url = EXCLUDED.url, updated_by = EXCLUDED.updated_by, updated_at = now(),
       google_email = EXCLUDED.google_email, refresh_token = EXCLUDED.refresh_token,
       last_checked_at = NULL, last_synced_at = NULL, source_modified = NULL, last_error = NULL`,
    [orgId, dataset, url, updatedBy || '', googleAccount ? googleAccount.email : null, googleAccount ? secretBox.encrypt(googleAccount.refreshToken) : null]
  );
}

async function removeSource(orgId, dataset) {
  await db.query('DELETE FROM org_sheet_sources WHERE org_id = $1 AND dataset = $2', [orgId, dataset]);
}

// A regular sheet link waiting for its Google sign-in (sheets-start -> callback), for LINK_REQUEST_MINUTES.
// The callback records the outcome on it (finishLinkRequest) for the dashboard to show when the tab
// comes back (/api/data?action=link-status). returnTo: 'popup' | 'settings' - where the dashboard reopens.
async function createLinkRequest(orgId, dataset, url, userId, returnTo) {
  if (parseLink(url).kind !== 'sheet') throw new SheetError('ลิงก์นี้ไม่ต้องเข้าสู่ระบบ Google');
  await db.query('DELETE FROM org_sheet_link_requests WHERE created_at < now() - make_interval(mins => $1)', [LINK_REQUEST_MINUTES]);
  const nonce = crypto.randomBytes(24).toString('base64url');
  await db.query(
    'INSERT INTO org_sheet_link_requests (nonce, org_id, dataset, url, user_id, return_to) VALUES ($1, $2, $3, $4, $5, $6)',
    [nonce, orgId, dataset, String(url).trim(), userId, returnTo === 'settings' ? 'settings' : 'popup']
  );
  return nonce;
}

async function getLinkRequest(nonce) {
  const { rows } = await db.query(
    'SELECT org_id, dataset, url, user_id, status, error, row_count, google_email, return_to FROM org_sheet_link_requests ' +
    'WHERE nonce = $1 AND created_at >= now() - make_interval(mins => $2)',
    [String(nonce || ''), LINK_REQUEST_MINUTES]
  );
  const r = rows[0];
  return r ? {
    orgId: r.org_id, dataset: r.dataset, url: r.url, userId: r.user_id, status: r.status || 'pending',
    error: r.error || '', rowCount: r.row_count, googleEmail: r.google_email || '', returnTo: r.return_to || 'popup'
  } : null;
}

async function finishLinkRequest(nonce, { status, error, rowCount, googleEmail }) {
  await db.query(
    'UPDATE org_sheet_link_requests SET status = $2, error = $3, row_count = $4, google_email = $5 WHERE nonce = $1',
    [String(nonce || ''), status, error || null, rowCount === undefined ? null : rowCount, googleEmail || null]
  );
}

// Re-reads the linked sheet into the dataset. -> { status: 'none' | 'skipped' | 'unchanged' | 'updated' | 'error', error?, manifest? }
// Without `force`, a source checked within SYNC_INTERVAL_SECONDS is skipped (the claim is one atomic UPDATE,
// so many viewers polling at once read the sheet only once).
async function syncDataset(orgId, dataset, { force } = {}) {
  if (datasetStore.DATASETS.indexOf(dataset) === -1) throw new Error('Unknown dataset');
  const { rows } = await db.query(
    `UPDATE org_sheet_sources SET last_checked_at = now()
     WHERE org_id = $1 AND dataset = $2 AND ($3 OR last_checked_at IS NULL OR last_checked_at < now() - make_interval(secs => $4))
     RETURNING url, google_email, refresh_token, source_modified`,
    [orgId, dataset, !!force, SYNC_INTERVAL_SECONDS]
  );
  if (!rows[0]) return { status: (await getSource(orgId, dataset)) ? 'skipped' : 'none' };
  const source = { url: rows[0].url, googleEmail: rows[0].google_email, refreshToken: rows[0].refresh_token };
  const lastHash = rows[0].source_modified;

  try {
    const values = await readSheet(parseLink(source.url), source);
    const hash = crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex');
    const current = await datasetStore.getManifest(orgId, dataset);
    if (current && hash === lastHash) {
      await db.query('UPDATE org_sheet_sources SET last_synced_at = now(), last_error = NULL WHERE org_id = $1 AND dataset = $2', [orgId, dataset]);
      return { status: 'unchanged' };
    }
    const sheetRows = valuesToRows(values);
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
      [orgId, dataset, hash]
    );
    return { status: 'updated', manifest };
  } catch (e) {
    const message = e instanceof SheetError ? e.message : 'ดึงข้อมูลจากชีตไม่สำเร็จ (' + e.message + ')';
    if (!(e instanceof SheetError)) console.error('[sheetSource] sync failed:', e);
    await db.query('UPDATE org_sheet_sources SET last_error = $3 WHERE org_id = $1 AND dataset = $2', [orgId, dataset, message.slice(0, 500)]);
    return { status: 'error', error: message };
  }
}

module.exports = {
  SheetError, SHEETS_SCOPE, parseLink, valuesToRows, parseCsv,
  getSource, setSource, removeSource, createLinkRequest, getLinkRequest, finishLinkRequest, syncDataset
};
