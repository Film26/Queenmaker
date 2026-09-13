// lib/emailNotify.js
// Emails every active Super Admin when a new Google sign-in access request comes in (see
// lib/accessRequestStore.js / api/auth/google/[action].js) - a Discord webhook (see
// lib/discordNotify.js) is easy to miss if nobody's watching that channel, whereas an email
// lands somewhere a Super Admin actually checks.
//
// Uses Resend's plain HTTP API (https://resend.com) via fetch instead of their SDK - no new
// npm dependency for what's otherwise a single POST request. Free tier needs no credit card
// and its default onboarding@resend.dev sender works with zero domain setup, so this can be
// wired up the same way the Discord webhook was: sign up, get an API key, set one env var.
//
// Server-only module - never required from anything under public/, so the API key can never
// end up in a browser bundle.
const userStore = require('./userStore');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || 'QueenMaker <onboarding@resend.dev>';

if (!RESEND_API_KEY) {
  console.warn('[emailNotify] RESEND_API_KEY is not set - access-request emails are disabled until it is configured.');
}

function escapeHtml(str) {
  return (str === null || str === undefined ? '' : String(str))
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', hour12: false });
  } catch (e) {
    return iso;
  }
}

async function activeSuperAdminEmails() {
  const users = await userStore.loadUsers();
  return users
    .filter(u => u.active && u.role === 'Super Admin')
    .map(u => u.username)
    // Mirrors userStore's EMAIL_RE requirement for usernames, but the seed admin account
    // ("admin") predates that rule and would otherwise get treated as a send target.
    .filter(username => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username || ''));
}

async function send(toList, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_ADDRESS, to: toList, subject, html })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[emailNotify] Resend API responded with an error:', res.status, body);
  }
}

// Only this one event type sends an email for now - see lib/discordNotify.js's NOTIFY_TYPES
// for the broader (Discord-only) alert list this deliberately doesn't duplicate.
async function notifyAccessRequestCreated(entry) {
  const toList = await activeSuperAdminEmails();
  if (toList.length === 0) {
    console.warn('[emailNotify] No active Super Admin has a real email as their username - access-request email skipped.');
    return;
  }

  const html = `
    <p>มีคำขอเข้าถึงระบบ QueenMaker ใหม่ ผ่านการ Sign in with Google</p>
    <p><strong>อีเมล:</strong> ${escapeHtml(entry.username)}<br>
       <strong>เวลา:</strong> ${escapeHtml(formatTime(entry.ts))}${entry.ip ? `<br><strong>IP:</strong> ${escapeHtml(entry.ip)}` : ''}</p>
    <p>เข้าไปที่ Settings &rarr; จัดการผู้ใช้งานระบบ เพื่ออนุมัติหรือปฏิเสธคำขอนี้</p>
  `;
  await send(toList, `QueenMaker: คำขอเข้าถึงระบบใหม่ (${entry.username})`, html);
}

// Fire-and-forget, same contract as discordNotify.notify() - a slow/down email API must
// never delay or fail whatever request triggered this audit entry.
function notify(entry) {
  if (!RESEND_API_KEY) return;
  if (entry.type !== 'access_request_created') return;
  try {
    notifyAccessRequestCreated(entry).catch(e => console.error('[emailNotify] notify() failed unexpectedly:', e.message));
  } catch (e) {
    console.error('[emailNotify] notify() failed unexpectedly:', e.message);
  }
}

module.exports = { notify };
