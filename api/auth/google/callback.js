// api/auth/google/callback.js - Vercel serverless function (also mounted directly in
// server.js for local dev). Handles Google's redirect back after the user approves (or
// denies) access on the consent screen.
//
// Google only proves *identity* here (this really is that Gmail address) - it says
// nothing about whether that person is allowed into Queenmaker. Authorization is still
// entirely lib/userStore.js's job: the email must match an existing, active user record
// that a Super Admin already created (via Settings, same as any other account) or the
// login is denied even though Google's part succeeded. This is deliberate - see the
// conversation that led here: Google login was added specifically so unregistered people
// can't get in just by having a Google account.
//
// Token verification goes through Google's own tokeninfo endpoint (a plain HTTPS call)
// instead of us decoding/verifying the id_token's JWT signature ourselves - avoids adding
// a JWT/JWKS-handling dependency for what is otherwise a small, infrequently-used feature.
const userStore = require('../../../lib/userStore');
const auditLog = require('../../../lib/auditLog');
const { createSessionCookie, getStateFromRequest, clearStateCookie } = require('../../../lib/session');
const { getClientIp } = require('../../../lib/reqUtils');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

module.exports = async function handler(req, res) {
  const ip = getClientIp(req);
  const { code, state, error } = req.query || {};

  // The state cookie is single-use - clear it now regardless of outcome. Any later
  // successful branch re-sets Set-Cookie with both this and the new session cookie.
  const expectedState = getStateFromRequest(req);
  res.setHeader('Set-Cookie', clearStateCookie());

  const deny = (reason) => res.redirect(`/?error=google_${reason}`);

  if (error) return deny('denied');
  if (!CLIENT_ID || !CLIENT_SECRET) return deny('not_configured');
  if (!code || !state || !expectedState || state !== expectedState) return deny('bad_state');

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const redirectUri = `${protocol}://${req.headers.host}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenRes.ok) return deny('token_exchange_failed');
    const tokenData = await tokenRes.json();
    if (!tokenData.id_token) return deny('no_id_token');

    // Google validates the token's signature/expiry for us and returns the decoded claims -
    // we only need to additionally check `aud` (was this issued for *our* client) ourselves.
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`);
    if (!infoRes.ok) return deny('token_verify_failed');
    const claims = await infoRes.json();

    if (claims.aud !== CLIENT_ID) return deny('audience_mismatch');
    if (claims.email_verified !== 'true' && claims.email_verified !== true) return deny('email_not_verified');

    const email = (claims.email || '').toLowerCase();
    const user = await userStore.findByUsername(email);

    if (!user || !user.active) {
      auditLog.append({ type: 'unauthorized_access', reason: 'google_email_not_registered', username: email || '(blank)', ip });
      return deny('not_authorized');
    }

    const sessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
    res.setHeader('Set-Cookie', [clearStateCookie(), createSessionCookie(sessionUser)]);
    await auditLog.append({ type: 'login_success', userId: user.id, username: user.username, role: user.role, ip, via: 'google' });
    return res.redirect('/dashboard.html');
  } catch (e) {
    console.error('[google-callback] Unexpected error:', e.message);
    return deny('unexpected_error');
  }
};
