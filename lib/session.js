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

// getUserFromRequest only checks the cookie's own signature/expiry, so a user deactivated
// (or reassigned a role) by a Super Admin mid-session keeps whatever access the cookie
// says until it naturally expires (up to MAX_AGE_MS later). This re-checks the signed
// identity against the live user record on every call so a revoked/deactivated account
// loses access immediately, and picks up role/name changes without waiting for re-login.
// Requires lib/userStore lazily (not at module load) to avoid a require cycle, since
// userStore doesn't need session.js but some callers of session.js are reached through it.
async function getAuthorizedUser(req) {
  const sessionUser = getUserFromRequest(req);
  if (!sessionUser) {
    logUnauthorized(req, { reason: 'no_valid_session' });
    return null;
  }
  const userStore = require('./userStore');
  const users = await userStore.loadUsers();
  const liveUser = users.find(u => u.id === sessionUser.id);
  if (!liveUser || !liveUser.active) {
    logUnauthorized(req, { reason: 'account_inactive_or_removed', username: sessionUser.username });
    return null;
  }
  return {
    id: liveUser.id,
    username: liveUser.username,
    name: liveUser.name,
    role: liveUser.role,
    adminName: liveUser.adminName || null
  };
}

// Every protected route (dashboard-guard + all api/*.js) already funnels through
// getAuthorizedUser, so this is the one place that needs to know about a denied request
// to raise a security alert - no need to repeat this call in every route file.
// Fire-and-forget (not awaited) so a denied request still gets its 401/redirect immediately.
function logUnauthorized(req, extra) {
  try {
    const auditLog = require('./auditLog');
    const { getClientIp } = require('./reqUtils');
    auditLog.append(Object.assign({
      type: 'unauthorized_access',
      path: req.url,
      method: req.method,
      ip: getClientIp(req)
    }, extra));
  } catch (e) {
    console.error('[session] Failed to log unauthorized access:', e.message);
  }
}

function createSessionCookie(user) {
  const token = sign({ user, exp: Date.now() + MAX_AGE_MS });
  const secure = process.env.VERCEL ? ' Secure;' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

// Short-lived, single-purpose cookie for the Google OAuth "state" CSRF token (see
// api/auth/google/start.js and callback.js) - separate from the main session cookie above,
// never carries any identity, just proves the callback request came from the redirect we
// issued rather than an attacker's crafted link.
const STATE_COOKIE_NAME = 'qm_oauth_state';
const STATE_MAX_AGE_SECONDS = 10 * 60; // 10 minutes - just long enough for a Google consent screen

function createStateCookie(state) {
  const secure = process.env.VERCEL ? ' Secure;' : '';
  return `${STATE_COOKIE_NAME}=${state}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${STATE_MAX_AGE_SECONDS}`;
}

function clearStateCookie() {
  return `${STATE_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

function getStateFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[STATE_COOKIE_NAME] || null;
}

module.exports = {
  getUserFromRequest, getAuthorizedUser, createSessionCookie, clearSessionCookie,
  createStateCookie, clearStateCookie, getStateFromRequest
};
