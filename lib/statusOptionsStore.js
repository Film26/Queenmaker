// lib/statusOptionsStore.js
// Server-side store for the configurable "สถานะการติดต่อ" (contact status) list used by
// the Sales Note feature - same Redis-backed pattern as lib/userStore.js/lib/notesStore.js.
// Falls back to the reference app's built-in default list until a Super Admin/Manager
// saves a custom one from Settings (mirrors the reference's Config_Status sheet, which is
// only created the first time someone saves a custom list).
const { redis } = require('./redisClient');

const STATUS_OPTIONS_KEY = 'crm:statusOptions';
const DEFAULT_STATUS_OPTIONS = ['คุยแล้ว', 'ยังไม่รับสาย', 'ไม่สะดวกให้โทร', 'ไม่ได้ทานแล้ว'];

async function loadStatusOptions() {
  if (!redis) return DEFAULT_STATUS_OPTIONS.slice();
  const list = await redis.get(STATUS_OPTIONS_KEY);
  return (Array.isArray(list) && list.length > 0) ? list : DEFAULT_STATUS_OPTIONS.slice();
}

async function saveStatusOptions(list) {
  if (!redis) throw new Error('No Redis database connected - cannot persist status options');
  const cleaned = (Array.isArray(list) ? list : [])
    .map(s => (s || '').toString().trim())
    .filter(s => s.length > 0);
  await redis.set(STATUS_OPTIONS_KEY, cleaned);
  return cleaned;
}

module.exports = { loadStatusOptions, saveStatusOptions, DEFAULT_STATUS_OPTIONS };
