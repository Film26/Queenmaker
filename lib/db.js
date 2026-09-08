// lib/db.js
// Postgres connection pool + schema bootstrap - replaces lib/redisClient.js. Reads
// DATABASE_URL only (works with Neon, Supabase, a local Postgres, or any standard
// Postgres connection string) so it can point at a local database for development and a
// cloud one (set as a Vercel Environment Variable) in production without any code change.
//
// See lib/schema.sql for the table definitions - ensureSchema() applies it (idempotent,
// IF NOT EXISTS) once per cold start before the first query, so a brand new database
// works with zero manual setup beyond creating it and setting DATABASE_URL.
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[db] DATABASE_URL is not set. Login and data storage will fail until a Postgres database is connected - see README.');
}

// Neon/Supabase (and most managed Postgres) require TLS but use a certificate chain
// `pg`'s default strict verification doesn't have - rejectUnauthorized:false still
// encrypts the connection, it just skips CA verification (the connection string itself,
// with its embedded password, is the actual secret being protected here).
const pool = connectionString
  ? new Pool({ connectionString, ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false } })
  : null;

let schemaReady = null;
function ensureSchema() {
  if (!pool) return Promise.resolve();
  if (!schemaReady) {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    schemaReady = pool.query(sql).catch(e => {
      schemaReady = null; // let the next call retry instead of staying broken forever
      throw e;
    });
  }
  return schemaReady;
}

async function query(text, params) {
  if (!pool) throw new Error('No Postgres database connected - set DATABASE_URL');
  await ensureSchema();
  return pool.query(text, params);
}

module.exports = { query, pool, ensureSchema, isConnected: !!pool };
