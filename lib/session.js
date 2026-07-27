// lib/session.js
// Replaces express-session (which needs a shared server-side session store - not
// available on Vercel's stateless serverless functions). Instead, the session itself
// (user id/username/name/role + expiry) is signed with HMAC-SHA256 and stored directly
// in an httpOnly cookie - no database round-trip needed to check who's logged in.
const crypto = require('crypto');

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.warn('[session] SESSION_SECRET is not set. Using an insecure development-only fallback - set a real SESSION_SECRET env var (in Vercel project settings, and locally) before relying on this for anything real.');
}
const SECRET = SESSION_SECRET || 'dev-only-insecure-secret-change-me';
const MAX_AGE_MS = 30 * 60 * 1000; // 30-minute idle session timeout (Task 7)
const COOKIE_NAME = 'qm_session';

function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return data.user;
  } catch (e) {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getUserFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verify(cookies[COOKIE_NAME]);
}

function createSessionCookie(user) {
  const token = sign({ user, exp: Date.now() + MAX_AGE_MS });
  const secure = process.env.VERCEL ? ' Secure;' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = { getUserFromRequest, createSessionCookie, clearSessionCookie };
