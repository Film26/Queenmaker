// lib/redisClient.js
// Vercel is serverless (no persistent local disk to write to), so user records and the
// audit log live in Redis instead of the JSON files this project used before deployment
// moved to Vercel. Works with either a Vercel Marketplace Redis integration (injects
// KV_REST_API_URL/KV_REST_API_TOKEN) or a direct Upstash Redis database
// (UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN) - see README for setup steps.
const { Redis } = require('@upstash/redis');

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.warn('[redisClient] No Redis connection configured (KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN missing). Login and User Management will fail until a Redis database is connected - see README.');
}

const redis = (url && token) ? new Redis({ url, token }) : null;

module.exports = { redis };
