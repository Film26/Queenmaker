// lib/auditLog.js
// Minimal append-only audit trail (login/logout/export/download events - Task 7).
// Stored in Postgres (see lib/db.js) - no writable local disk on Vercel.
const db = require('./db');
const discordNotify = require('./discordNotify');

async function append(entry) {
  const full = Object.assign({ ts: new Date().toISOString() }, entry);
  if (!db.isConnected) {
    console.error('[auditLog] No Postgres database connected - audit entry dropped:', full);
  } else {
    try {
      await db.query('INSERT INTO audit_log (ts, type, data) VALUES ($1,$2,$3)', [full.ts, full.type, JSON.stringify(full)]);
    } catch (e) {
      console.error('[auditLog] Failed to write audit entry:', e.message);
    }
  }
  // Fire-and-forget: a slow/down Discord API must never delay or fail whatever request
  // triggered this audit entry (login, note save, etc.) - see lib/discordNotify.js.
  discordNotify.notify(full);
}

module.exports = { append };
