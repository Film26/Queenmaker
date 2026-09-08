// api/auth/login.js - Vercel serverless function (also mounted directly in server.js for local dev).
const userStore = require('../../lib/userStore');
const auditLog = require('../../lib/auditLog');
const loginAttempts = require('../../lib/loginAttempts');
const { createSessionCookie } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  const ip = getClientIp(req);

  if (await loginAttempts.isLocked(username, ip)) {
    await auditLog.append({ type: 'login_locked', username: username || '(blank)', ip });
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
  }

  const user = await userStore.findByUsername(username);

  if (!user || !user.active || !userStore.verifyPassword(user, password)) {
    await loginAttempts.recordFailure(username, ip);
    await auditLog.append({ type: 'login_failed', username: username || '(blank)', ip });
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  await loginAttempts.clearFailures(username, ip);
  const sessionUser = { id: user.id, username: user.username, name: user.name, role: user.role };
  res.setHeader('Set-Cookie', createSessionCookie(sessionUser));
  await auditLog.append({ type: 'login_success', userId: user.id, username: user.username, role: user.role, ip });
  res.status(200).json({ ok: true, user: sessionUser });
};
