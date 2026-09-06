// api/discord/config.js - Vercel serverless function (also mounted directly in server.js for local dev).
// Lets a Super Admin set the Discord webhook URL used by lib/discordNotify.js through the
// app's own API instead of a Vercel Environment Variable - see lib/discordConfigStore.js.
// Super Admin only for both methods (unlike api/insighthub/config.js's GET, which any
// logged-in user needs client-side) - nothing in the frontend needs this value, so it's
// never sent to a browser at all: GET only reports whether one is set, never the URL
// itself, matching "never send secrets to the frontend" from the original hardening task.
const discordConfigStore = require('../../lib/discordConfigStore');
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (sessionUser.role !== 'Super Admin') {
    auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    const url = await discordConfigStore.loadWebhookUrl();
    return res.status(200).json({ configured: !!url });
  }

  if (req.method === 'PUT') {
    try {
      const { webhookUrl } = req.body || {};
      if (typeof webhookUrl !== 'string' || !webhookUrl.trim()) return res.status(400).json({ error: 'webhookUrl is required' });
      await discordConfigStore.saveWebhookUrl(webhookUrl);
      await auditLog.append({ type: 'discord_config_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req) });
      return res.status(200).json({ configured: true });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
