// lib/statusOptionsStore.js
// Server-side store for the configurable "สถานะการติดต่อ" (contact status) list used by
// the Sales Note feature - same Postgres-backed pattern as lib/userStore.js/lib/notesStore.js
// (see lib/db.js), stored as one row in the generic app_config table. Falls back to the
// reference app's built-in default list until a Super Admin/Manager saves a custom one from
// Settings (mirrors the reference's Config_Status sheet, which is only created the first
// time someone saves a custom list).
const db = require('./db');

const CONFIG_KEY = 'statusOptions';
const DEFAULT_STATUS_OPTIONS = ['คุยแล้ว', 'ยังไม่รับสาย', 'ไม่สะดวกให้โทร', 'ไม่ได้ทานแล้ว'];

async function loadStatusOptions() {
  if (!db.isConnected) return DEFAULT_STATUS_OPTIONS.slice();
  const { rows } = await db.query('SELECT value FROM app_config WHERE key=$1', [CONFIG_KEY]);
  const list = rows[0] && rows[0].value;
  return (Array.isArray(list) && list.length > 0) ? list : DEFAULT_STATUS_OPTIONS.slice();
}

async function saveStatusOptions(list) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist status options');
  const cleaned = (Array.isArray(list) ? list : [])
    .map(s => (s || '').toString().trim())
    .filter(s => s.length > 0);
  await db.query(
    'INSERT INTO app_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
    [CONFIG_KEY, JSON.stringify(cleaned)]
  );
  return cleaned;
}

module.exports = { loadStatusOptions, saveStatusOptions, DEFAULT_STATUS_OPTIONS };
