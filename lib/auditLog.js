// lib/auditLog.js
// Minimal append-only audit trail (login/logout/export/download events - Task 7).
// Stored as a Redis list (see lib/redisClient.js) - no writable local disk on Vercel.
const { redis } = require('./redisClient');
const telegramNotify = require('./telegramNotify');

const AUDIT_KEY = 'crm:audit_log';

async function append(entry) {
  const full = Object.assign({ ts: new Date().toISOString() }, entry);
  if (!redis) {
    console.error('[auditLog] No Redis database connected - audit entry dropped:', full);
  } else {
    try {
      await redis.rpush(AUDIT_KEY, JSON.stringify(full));
    } catch (e) {
      console.error('[auditLog] Failed to write audit entry:', e.message);
    }
  }
  // Fire-and-forget: a slow/down Telegram API must never delay or fail whatever request
  // triggered this audit entry (login, note save, etc.) - see lib/telegramNotify.js.
  telegramNotify.notify(full);
}

module.exports = { append };
