// api/auth/google/[action].js - Vercel serverless function (also mounted directly in
// server.js for local dev, at two separate Express routes pointing to this same module).
//
// Combines what used to be two separate files (start.js + callback.js) into one, because
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions and adding those two
// files as separate functions pushed this project to exactly that limit, silently failing
// the whole deployment (see the "red X" in GitHub's Production environment status for
// commit d84bffd - /api/auth/google/start returned 404 in production even though the
// build succeeded locally and this file's logic is unchanged from the two originals).
// Vercel's [param].js dynamic-route convention lets one function file answer multiple
// paths - here `action` is 'start' or 'callback' depending on which URL was hit
// (/api/auth/google/start or /api/auth/google/callback) - so this counts as ONE function
// instead of two. Prefer this pattern over adding more single-purpose files under api/
// going forward, to leave headroom under that limit.
const crypto = require('crypto');
const userStore = require('../../../lib/userStore');
const accessRequestStore = require('../../../lib/accessRequestStore');
const orgStore = require('../../../lib/orgStore');
const auditLog = require('../../../lib/auditLog');
const { createSessionCookie, createStateCookie, getStateFromRequest, clearStateCookie, getAuthorizedUser } = require('../../../lib/session');
const { getClientIp } = require('../../../lib/reqUtils');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID) {
  console.warn('[google-oauth] GOOGLE_CLIENT_ID is not set - "Sign in with Google" is disabled until it is configured.');
}

function redirectUriFor(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return `${protocol}://${req.headers.host}/api/auth/google/callback`;
}

// Sends the browser to Google's consent screen with a random `state` value (also stashed
// in a short-lived cookie) so handleCallback can confirm the callback really came from a
// redirect we issued, not a forged link (standard OAuth CSRF protection).
async function handleStart(req, res) {
  if (!CLIENT_ID) {
    return res.status(500).send('Google sign-in is not configured.');
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUriFor(req),
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account'
  });

  res.setHeader('Set-Cookie', createStateCookie(state));
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}

// `reason` is always one of the fixed strings passed by deny()/success below, never
// user-controlled input, so it's safe to inline into the script without escaping.
function popupResultPage(status, reason) {
  const message = JSON.stringify({ source: 'queenmaker-google-auth', status, reason: reason || '' });
  return `<!doctype html><html><body><script>
(function () {
  var msg = ${message};
  if (window.opener) { window.opener.postMessage(msg, window.location.origin); }
  window.close();
})();
</script></body></html>`;
}

// Handles Google's redirect back after the user approves (or denies) access on the
// consent screen. Runs inside a popup window (opened by public/index.html) so instead of
// redirecting the browser anywhere, every outcome here renders a tiny self-closing page
// that posts the result back to window.opener via postMessage and closes itself - the
// main login tab is what actually navigates to the dashboard or shows an error.
//
// Google only proves *identity* here (this really is that Gmail address) - it says
// nothing about whether that person is allowed into Queenmaker. Authorization is still
// entirely lib/userStore.js's job: the email must match an existing, active user record
// that a Super Admin already created/approved (via Settings) or the login is denied even
// though Google's part succeeded. This is deliberate - Google login was added specifically
// so unregistered people can't get in just by having a Google account.
//
// An email with no user row at all doesn't just get turned away, though: it lands in
// lib/accessRequestStore.js as a pending "request access" row that a Super Admin reviews
// and approves/rejects from Settings (see api/users/index.js's access-requests branch) -
// approving creates the real user row. A deactivated *existing* account is different (a
// deliberate decision by a Super Admin already), so that case is still a flat denial, no
// request created.
//
// Token verification goes through Google's own tokeninfo endpoint (a plain HTTPS call)
// instead of us decoding/verifying the id_token's JWT signature ourselves - avoids adding
// a JWT/JWKS-handling dependency for what is otherwise a small, infrequently-used feature.
async function handleCallback(req, res) {
  const ip = getClientIp(req);
  const { code, state, error } = req.query || {};

  // The state cookie is single-use - clear it now regardless of outcome. The success
  // branch below re-sets Set-Cookie with both this and the new session cookie.
  const expectedState = getStateFromRequest(req);
  res.setHeader('Set-Cookie', clearStateCookie());

  const deny = (reason) => res.status(200).send(popupResultPage('error', reason));

  if (error) return deny('denied');
  if (!CLIENT_ID || !CLIENT_SECRET) return deny('not_configured');
  if (!code || !state || !expectedState || state !== expectedState) return deny('bad_state');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUriFor(req),
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

    if (user && !user.active) {
      auditLog.append({ type: 'unauthorized_access', reason: 'account_deactivated', username: email, ip });
      return deny('not_authorized');
    }

    if (!user) {
      const already = await accessRequestStore.findPendingByEmail(email);
      if (!already) {
        const orgId = await orgStore.resolveOrgIdForEmail(email);
        await accessRequestStore.create(email, claims.name || email, orgId);
        await auditLog.append({ type: 'access_request_created', orgId, username: email, ip });
      }
      return deny('access_request_pending');
    }

    const sessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
    res.setHeader('Set-Cookie', [clearStateCookie(), createSessionCookie(sessionUser)]);
    await auditLog.append({ type: 'login_success', userId: user.id, username: user.username, role: user.role, ip, via: 'google' });
    return res.status(200).send(popupResultPage('success'));
  } catch (e) {
    console.error('[google-callback] Unexpected error:', e.message);
    return deny('unexpected_error');
  }
}

// --- Import Data from Google Sheet with the user's own Google account ---------------------------
// The dashboard reads a non-public sheet through the Sheets API using a short-lived, read-only
// access token that Google issues to the browser (Google Identity Services token flow) - Google
// itself decides whether that account can open the sheet, so the sheet can stay Restricted. The
// token never comes back here except for this one identity check and is never stored.
//
// Policy: only Google Workspace (company) accounts may import this way, plus the founding
// organization's own users (DEFAULT_ORG_ID), who may be on plain Gmail. Workspace accounts are
// recognised by the `hd` (hosted domain) claim Google returns for them; consumer Gmail has none.
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

async function handleSheetsConfig(req, res) {
  if (!(await getAuthorizedUser(req))) return res.status(401).json({ error: 'Not authenticated' });
  return res.status(200).json({ clientId: CLIENT_ID || '', scope: SHEETS_SCOPE });
}

async function handleSheetsVerify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });
  const accessToken = req.body && typeof req.body.accessToken === 'string' ? req.body.accessToken : '';
  if (!CLIENT_ID || !accessToken) return res.status(400).json({ error: 'bad_request' });

  try {
    // tokeninfo proves the token is live and was issued to *our* client (not replayed from another app)
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!infoRes.ok) return res.status(401).json({ error: 'token_invalid' });
    const info = await infoRes.json();
    if (info.aud !== CLIENT_ID && info.azp !== CLIENT_ID) return res.status(401).json({ error: 'token_invalid' });
    if (!String(info.scope || '').split(' ').includes(SHEETS_SCOPE)) return res.status(403).json({ error: 'scope_missing' });

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!userRes.ok) return res.status(401).json({ error: 'token_invalid' });
    const profile = await userRes.json();
    const email = String(profile.email || '').toLowerCase();
    if (!email || (profile.email_verified !== true && profile.email_verified !== 'true')) return res.status(403).json({ error: 'email_not_verified' });

    const isWorkspace = !!profile.hd;
    let allowed = isWorkspace;
    if (!allowed) {
      const user = await userStore.findByUsername(email);
      allowed = !!(user && user.active && (user.orgId || orgStore.DEFAULT_ORG_ID) === orgStore.DEFAULT_ORG_ID);
    }
    if (!allowed) {
      await auditLog.append({ type: 'unauthorized_access', reason: 'sheets_import_non_workspace', userId: sessionUser.id, username: sessionUser.username, googleEmail: email, ip: getClientIp(req) });
      return res.status(403).json({ error: 'workspace_only', email });
    }
    return res.status(200).json({ ok: true, email, workspace: isWorkspace });
  } catch (e) {
    console.error('[google-sheets-verify] Unexpected error:', e.message);
    return res.status(502).json({ error: 'verify_failed' });
  }
}

module.exports = async function handler(req, res) {
  const action = req.query && req.query.action;
  if (action === 'start') return handleStart(req, res);
  if (action === 'callback') return handleCallback(req, res);
  if (action === 'sheets-config') return handleSheetsConfig(req, res);
  if (action === 'sheets-verify') return handleSheetsVerify(req, res);
  return res.status(404).send('Not found');
};
