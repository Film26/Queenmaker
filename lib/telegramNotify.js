// lib/telegramNotify.js
// Fire-and-forget Telegram alert for security-relevant audit events (called from
// lib/auditLog.js, plus lib/session.js/api/*.js for events that don't otherwise flow
// through auditLog.append - see NOTIFY_TYPES below for the exact list).
//
// Server-only module - never required from anything under public/, so the bot token can
// never end up in a browser bundle. Reads TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID from
// process.env only (set them in Vercel project settings and/or a local, gitignored .env -
// see README) - never hardcode them here.
//
// notify() never throws and is never awaited by callers: a slow or down Telegram API must
// never slow down or fail the request that triggered the security event.

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
  console.warn('[telegramNotify] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set - security notifications disabled (audit log still works normally).');
}

// Only these audit-log event types trigger a Telegram message - everything else appended
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
// in the app can never leak into Telegram without an explicit line added here first.
function buildMessage(entry) {
  const label = NOTIFY_TYPES[entry.type];
  if (!label) return null;

  const lines = ['🔐 QueenMaker Security Alert', '', `Event: ${label}`];
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
  if (!BOT_TOKEN || !CHAT_ID) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
      signal: controller.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[telegramNotify] Telegram API responded with an error:', res.status, body);
    }
  } catch (e) {
    console.error('[telegramNotify] Failed to send Telegram notification:', e.message);
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
    send(text);
  } catch (e) {
    console.error('[telegramNotify] notify() failed unexpectedly:', e.message);
  }
}

module.exports = { notify };
