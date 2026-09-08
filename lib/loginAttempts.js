// lib/loginAttempts.js
// Brute-force protection for api/auth/login.js - counts failed attempts per
// username+IP in Redis with a sliding window, and temporarily locks that pair out
// after too many. Complements bcrypt-hashed passwords (lib/userStore.js) rather than
// replacing them - this is the piece that stops repeated password guessing.
//
// Fails open when Redis is unavailable (same philosophy as lib/auditLog.js elsewhere
// in this app): a down/unconfigured database must never itself block legitimate login,
// so isLocked() just returns false and the other functions no-op.
const { redis } = require('./redisClient');

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

function key(username, ip) {
  return `crm:loginAttempts:${(username || '').trim().toLowerCase()}:${ip || ''}`;
}

async function isLocked(username, ip) {
  if (!redis) return false;
  const count = await redis.get(key(username, ip));
  return Number(count) >= MAX_ATTEMPTS;
}

async function recordFailure(username, ip) {
  if (!redis) return;
  const k = key(username, ip);
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, WINDOW_SECONDS);
}

async function clearFailures(username, ip) {
  if (!redis) return;
  await redis.del(key(username, ip));
}

module.exports = { isLocked, recordFailure, clearFailures, MAX_ATTEMPTS, WINDOW_SECONDS };
