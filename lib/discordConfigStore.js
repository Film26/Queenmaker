// lib/discordConfigStore.js
// Server-side store for the Discord webhook URL used by lib/discordNotify.js. Backed by
// Redis (same pattern as lib/insightHubConfigStore.js) so it can be set through the app's
// own API (see api/discord/config.js) instead of a Vercel Environment Variable - useful
// when the Vercel plan in use gates adding new env vars, or just to avoid touching the
// Vercel dashboard at all for something that changes rarely.
const { redis } = require('./redisClient');

const CONFIG_KEY = 'crm:discordWebhookUrl';

async function loadWebhookUrl() {
  if (!redis) return '';
  const url = await redis.get(CONFIG_KEY);
  return typeof url === 'string' ? url : '';
}

async function saveWebhookUrl(url) {
  if (!redis) throw new Error('No Redis database connected - cannot persist Discord webhook URL');
  const trimmed = (url || '').trim();
  await redis.set(CONFIG_KEY, trimmed);
  return trimmed;
}

module.exports = { loadWebhookUrl, saveWebhookUrl };
