// api/auth/google/start.js - Vercel serverless function (also mounted directly in
// server.js for local dev). Kicks off "Sign in with Google": sends the browser to Google's
// consent screen with a random `state` value (also stashed in a short-lived cookie) so
// api/auth/google/callback.js can confirm the callback really came from a redirect we
// issued, not a forged link (standard OAuth CSRF protection).
const crypto = require('crypto');
const { createStateCookie } = require('../../../lib/session');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!CLIENT_ID) {
  console.warn('[google-oauth] GOOGLE_CLIENT_ID is not set - "Sign in with Google" is disabled until it is configured.');
}

module.exports = async function handler(req, res) {
  if (!CLIENT_ID) {
    return res.status(500).send('Google sign-in is not configured.');
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${protocol}://${req.headers.host}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    prompt: 'select_account'
  });

  res.setHeader('Set-Cookie', createStateCookie(state));
  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
};
