// lib/secretBox.js
// AES-256-GCM encryption for secrets stored in the database (the Google refresh tokens that let the
// server read a linked sheet - see lib/sheetSource.js). The key is derived from SESSION_SECRET (same
// fallback as lib/session.js), so a database dump alone can't be used to read anyone's sheets.
const crypto = require('crypto');

const key = crypto.createHash('sha256').update('qm-secret-box:' + (process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me')).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}

function decrypt(box) {
  const [iv, tag, data] = String(box || '').split('.').map(p => Buffer.from(p, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
