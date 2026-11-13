// lib/googleServiceAccount.js
// Access token for the Google service account the server uses to read linked Google Sheets (see
// lib/sheetSource.js). A sheet is read only if its owner shares it with this account's email
// (Viewer) - the sheet itself can stay Restricted.
//
// GOOGLE_SERVICE_ACCOUNT_KEY holds the service account's JSON key file, either as-is or base64
// encoded (easier to paste into Vercel). Signs the OAuth JWT itself with node:crypto, so no Google
// client library is needed.
const crypto = require('crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  // only to read a file's modifiedTime, so an unchanged sheet isn't downloaded again
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

let cachedToken = null; // { token, expiresAt }

function credentials() {
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').trim();
  if (!raw) return null;
  try {
    const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (!json.client_email || !json.private_key) return null;
    return { email: json.client_email, key: json.private_key.replace(/\\n/g, '\n') };
  } catch (e) {
    console.error('[googleServiceAccount] GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON');
    return null;
  }
}

function serviceAccountEmail() {
  const creds = credentials();
  return creds ? creds.email : '';
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const creds = credentials();
  if (!creds) throw new Error('ยังไม่ได้ตั้งค่า Service Account ของ Google (GOOGLE_SERVICE_ACCOUNT_KEY)');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' +
    b64url(JSON.stringify({ iss: creds.email, scope: SCOPES.join(' '), aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signature = b64url(crypto.createSign('RSA-SHA256').update(unsigned).sign(creds.key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('Service Account ของ Google เข้าสู่ระบบไม่สำเร็จ (' + (data.error_description || data.error || res.status) + ')');
  cachedToken = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in || 3600) - 120) * 1000 };
  return cachedToken.token;
}

module.exports = { getAccessToken, serviceAccountEmail };
