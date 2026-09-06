// lib/discordNotify.js
// Fire-and-forget Discord alert for security-relevant audit events (called from
// lib/auditLog.js, plus lib/session.js/api/*.js for events that don't otherwise flow
// through auditLog.append - see NOTIFY_TYPES below for the exact list).
//
// Server-only module - never required from anything under public/, so the webhook URL can
// never end up in a browser bundle. The webhook URL itself is the secret (Discord webhooks
// need no separate token), so treat it exactly like a password - anyone with the URL can
// post into that channel. Never hardcode it here - it comes from one of two places:
//   1. DISCORD_WEBHOOK_URL env var, if set (useful for local dev/testing) - checked first.
//   2. Otherwise lib/discordConfigStore.js (Redis), set via a Super Admin calling
//      PUT /api/discord/config - avoids needing to touch Vercel's Environment Variables
//      page at all, e.g. when the plan in use gates adding new ones.
//
// notify() never throws and is never awaited by callers: a slow or down Discord API must
// never slow down or fail the request that triggered the security event.

const discordConfigStore = require('./discordConfigStore');

async function getWebhookUrl() {
  if (process.env.DISCORD_WEBHOOK_URL) return process.env.DISCORD_WEBHOOK_URL;
  return discordConfigStore.loadWebhookUrl();
}

// Only these audit-log event types trigger a Discord message - everything else appended
// via lib/auditLog.js (e.g. note_updated) stays a silent audit entry, same as before this
// feature existed, so this stays additive rather than turning every audit write into a ping.
const NOTIFY_TYPES = {
  login_success: 'Successful Login',
  login_failed: 'Failed Login Attempt',
  dashboard_access: 'Dashboard Accessed',
  unauthorized_access: 'Unauthorized Access Attempt',
  users_updated: 'User Permissions Changed'
};

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
  } catch (e) {
    return iso;
  }
}

// Builds the alert text - deliberately whitelists which fields go out rather than dumping
// the whole audit entry, so a field added to some future auditLog.append() call elsewhere
// in the app can never leak into Discord without an explicit line added here first.
function buildMessage(entry) {
  const label = NOTIFY_TYPES[entry.type];
  if (!label) return null;

  const lines = ['🔐 **QueenMaker Security Alert**', '', `Event: ${label}`];
  if (entry.username) lines.push(`User: ${entry.username}`);
  lines.push(`Time: ${formatTime(entry.ts)}`);
  if (entry.ip) lines.push(`IP: ${entry.ip}`);
  if (entry.type === 'unauthorized_access') {
    if (entry.method || entry.path) lines.push(`Endpoint: ${entry.method || ''} ${entry.path || ''}`.trim());
    if (entry.reason) lines.push(`Reason: ${entry.reason}`);
  }
  if (entry.type === 'users_updated' && entry.count != null) lines.push(`Users affected: ${entry.count}`);

  return lines.join('\n');
}

async function send(text) {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) {
    console.warn('[discordNotify] No Discord webhook configured (DISCORD_WEBHOOK_URL env var or PUT /api/discord/config) - notification skipped.');
    return;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[discordNotify] Discord webhook responded with an error:', res.status, body);
    }
  } catch (e) {
    console.error('[discordNotify] Failed to send Discord notification:', e.message);
  } finally {
    clearTimeout(timer);
  }
}

// Synchronous-looking call site, asynchronous fire-and-forget under the hood - callers
// should NOT await this.
function notify(entry) {
  try {
    const text = buildMessage(entry);
    if (!text) return;
    send(text).catch(e => console.error('[discordNotify] notify() failed unexpectedly:', e.message));
  } catch (e) {
    console.error('[discordNotify] notify() failed unexpectedly:', e.message);
  }
}

module.exports = { notify };
