// lib/auditLog.js
// Minimal append-only audit trail (login/logout/export/download events - Task 7).
// Stored as a Redis list (see lib/redisClient.js) - no writable local disk on Vercel.
const { redis } = require('./redisClient');

const AUDIT_KEY = 'crm:audit_log';

async function append(entry) {
  if (!redis) {
    console.error('[auditLog] No Redis database connected - audit entry dropped:', entry);
    return;
  }
  try {
    await redis.rpush(AUDIT_KEY, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)));
  } catch (e) {
    console.error('[auditLog] Failed to write audit entry:', e.message);
  }
}

module.exports = { append };
