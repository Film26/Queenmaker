-- lib/schema.sql
-- Applied idempotently on every cold start by lib/db.js (ensureSchema) - safe to run
-- repeatedly since every statement is IF NOT EXISTS. This is the Postgres replacement for
-- the Redis keys the app used to read/write directly (crm:users, crm:notes, crm:audit_log,
-- crm:statusOptions, crm:discordWebhookUrl, crm:loginAttempts:*).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL,
  admin_name TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Current state" per customer (overwritten on save), not an append-only log - mirrors
-- lib/notesStore.js's previous single-object-keyed-by-customerKey shape in Redis.
CREATE TABLE IF NOT EXISTS notes (
  customer_key TEXT PRIMARY KEY,
  customer_name TEXT,
  note TEXT,
  statuses TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- Append-only (see lib/auditLog.js). `data` holds the full entry (including type/ts) as
-- JSON so new fields never require a migration - `type`/`ts` are duplicated as real
-- columns only because they're the two things ever queried/filtered on.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Brute-force lockout window per username+IP (see lib/loginAttempts.js). A row past its
-- expires_at is treated as expired rather than actively deleted by a background job -
-- recordFailure()/isLocked() both check the timestamp themselves.
CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Generic single-value config store (status options list, Discord webhook URL, etc.) -
-- one row per setting, value as JSONB so each setting can be whatever shape it needs
-- (an array, a string, an object) without a schema change per setting.
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
