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

-- Multi-organization support: every user belongs to exactly one organization, and
-- org-owned data (KPI targets, notes, status options, Settings config, access requests, the
-- export log) is keyed by org_id so two customers on the same deployment never see each
-- other's data. Users that predate this column are backfilled
-- into 'org_default'; to split a customer out, INSERT a new organizations row and
-- UPDATE users SET org_id = '<new id>' for that customer's accounts.
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- email_domain (optional): a Google sign-in from an address with no account yet is filed as an
-- access request in the org whose email_domain matches, otherwise in org_default. Never set it
-- to a public domain such as gmail.com - every gmail address would be routed to that org.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email_domain TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_email_domain_idx
  ON organizations (lower(email_domain)) WHERE email_domain IS NOT NULL;

INSERT INTO organizations (id, name) VALUES ('org_default', 'Default Organization')
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id TEXT;
UPDATE users SET org_id = 'org_default' WHERE org_id IS NULL;
ALTER TABLE users ALTER COLUMN org_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS users_org_id_idx ON users (org_id);

-- KPI targets from the KPI Setting page, one row per organization (previously kept in each
-- browser's localStorage, which was shared by every account using that browser). `data` is
-- the whole KPI state object the page builds, so new fields never need a migration.
CREATE TABLE IF NOT EXISTS kpi_settings (
  org_id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

-- "Current state" per customer (overwritten on save), not an append-only log - mirrors
-- lib/notesStore.js's previous single-object-keyed-by-customerKey shape in Redis.
CREATE TABLE IF NOT EXISTS notes (
  org_id TEXT NOT NULL,
  customer_key TEXT NOT NULL,
  customer_name TEXT,
  note TEXT,
  statuses TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (org_id, customer_key)
);

-- Upgrade path for a notes table created before org support (single-column primary key on
-- customer_key): backfill into org_default, then swap the key. Each step is a no-op once done.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS org_id TEXT;
UPDATE notes SET org_id = 'org_default' WHERE org_id IS NULL;
ALTER TABLE notes ALTER COLUMN org_id SET NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notes'::regclass AND contype = 'p' AND array_length(conkey, 1) = 1
  ) THEN
    ALTER TABLE notes DROP CONSTRAINT notes_pkey;
    ALTER TABLE notes ADD PRIMARY KEY (org_id, customer_key);
  END IF;
END $$;

-- Append-only (see lib/auditLog.js). `data` holds the full entry (including type/ts) as
-- JSON so new fields never require a migration - `type`/`ts` are duplicated as real
-- columns only because they're the two things ever queried/filtered on.
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  type TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- org_id is NULL for events that can't be tied to an organization (e.g. a failed login for a
-- username that doesn't exist). Existing rows are assigned once, when the column is first added
-- (by the user that caused them, else org_default) - the guard keeps this from re-running.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'audit_log' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN org_id TEXT;
    UPDATE audit_log SET org_id = COALESCE((SELECT u.org_id FROM users u WHERE u.id = audit_log.data->>'userId'), 'org_default');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS audit_log_org_type_ts_idx ON audit_log (org_id, type, ts DESC);

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

-- Org-owned settings are keyed '<name>:<org_id>' (e.g. 'statusOptions:org_default',
-- 'settingsConfig:org_default'). The status list used to be a single global 'statusOptions' row -
-- move it to org_default's key (skipped if that key already exists).
UPDATE app_config SET key = 'statusOptions:org_default'
  WHERE key = 'statusOptions'
    AND NOT EXISTS (SELECT 1 FROM app_config WHERE key = 'statusOptions:org_default');

-- Google sign-in "request access" flow (see lib/accessRequestStore.js): a Google account
-- that authenticates successfully but has no matching row in `users` can't get in on its
-- own anymore - it lands here as a pending request instead, and a Super Admin must approve
-- it (creating the real user row) or reject it from Settings before that email can log in.
CREATE TABLE IF NOT EXISTS access_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

-- Which organization's Super Admins see and decide this request (see lib/orgStore.js).
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS org_id TEXT;
UPDATE access_requests SET org_id = 'org_default' WHERE org_id IS NULL;
ALTER TABLE access_requests ALTER COLUMN org_id SET NOT NULL;

-- Only one *pending* request per email at a time - once it's approved/rejected, the same
-- email can end up with another row later (e.g. rejected, then re-requests) without
-- conflicting with old decided rows.
CREATE UNIQUE INDEX IF NOT EXISTS access_requests_pending_email_idx
  ON access_requests (email) WHERE status = 'pending';
