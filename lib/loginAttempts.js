// lib/loginAttempts.js
// Brute-force protection for api/auth/login.js - counts failed attempts per
// username+IP in Postgres (see lib/db.js) with a sliding window, and temporarily locks
// that pair out after too many. Complements bcrypt-hashed passwords (lib/userStore.js)
// rather than replacing them - this is the piece that stops repeated password guessing.
//
// Fails open when Postgres is unavailable (same philosophy as lib/auditLog.js elsewhere
// in this app): a down/unconfigured database must never itself block legitimate login,
// so isLocked() just returns false and the other functions no-op.
const db = require('./db');

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

function key(username, ip) {
  return `${(username || '').trim().toLowerCase()}:${ip || ''}`;
}

async function isLocked(username, ip) {
  if (!db.isConnected) return false;
  const { rows } = await db.query('SELECT count, expires_at FROM login_attempts WHERE key=$1', [key(username, ip)]);
  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date()) return false;
  return row.count >= MAX_ATTEMPTS;
}

async function recordFailure(username, ip) {
  if (!db.isConnected) return;
  const k = key(username, ip);
  const { rows } = await db.query('SELECT count, expires_at FROM login_attempts WHERE key=$1', [k]);
  const row = rows[0];
  const now = new Date();
  if (!row || new Date(row.expires_at) < now) {
    // First failure, or the previous window already expired - start a fresh window.
    const expiresAt = new Date(now.getTime() + WINDOW_SECONDS * 1000);
    await db.query(
      `INSERT INTO login_attempts (key, count, expires_at) VALUES ($1, 1, $2)
       ON CONFLICT (key) DO UPDATE SET count=1, expires_at=EXCLUDED.expires_at`,
      [k, expiresAt]
    );
  } else {
    await db.query('UPDATE login_attempts SET count = count + 1 WHERE key=$1', [k]);
  }
}

async function clearFailures(username, ip) {
  if (!db.isConnected) return;
  await db.query('DELETE FROM login_attempts WHERE key=$1', [key(username, ip)]);
}

module.exports = { isLocked, recordFailure, clearFailures, MAX_ATTEMPTS, WINDOW_SECONDS };
