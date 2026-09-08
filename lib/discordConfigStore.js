// lib/discordConfigStore.js
// Server-side store for the Discord webhook URL used by lib/discordNotify.js. Backed by
// Postgres (see lib/db.js), stored as one row in the generic app_config table, so it can be
// set through the app's own API (see api/discord/config.js) instead of a Vercel Environment
// Variable - useful when the Vercel plan in use gates adding new env vars, or just to avoid
// touching the Vercel dashboard at all for something that changes rarely.
const db = require('./db');

const CONFIG_KEY = 'discordWebhookUrl';

async function loadWebhookUrl() {
  if (!db.isConnected) return '';
  const { rows } = await db.query('SELECT value FROM app_config WHERE key=$1', [CONFIG_KEY]);
  const url = rows[0] && rows[0].value;
  return typeof url === 'string' ? url : '';
}

async function saveWebhookUrl(url) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist Discord webhook URL');
  const trimmed = (url || '').trim();
  await db.query(
    'INSERT INTO app_config (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value',
    [CONFIG_KEY, JSON.stringify(trimmed)]
  );
  return trimmed;
}

module.exports = { loadWebhookUrl, saveWebhookUrl };
