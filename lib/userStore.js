// lib/userStore.js
// Server-side user store for real authentication (replaces the old client-only
// hardcoded check in index.html). Backed by Postgres (see lib/db.js) since Vercel's
// serverless functions have no writable persistent local disk.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const { DEFAULT_ORG_ID } = require('./orgStore');

function seedDefaultUsers() {
  // Matches the demo seed user that used to live only in public/settings.js
  // (localStorage), now the single source of truth for login.
  return [{
    id: 'id_seed_admin',
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
    name: 'ผู้ดูแลระบบ',
    role: 'Super Admin',
    adminName: null,
    orgId: DEFAULT_ORG_ID,
    active: true,
    createdAt: new Date().toISOString()
  }];
}

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    name: row.name,
    role: row.role,
    adminName: row.admin_name,
    orgId: row.org_id,
    active: row.active,
    createdAt: row.created_at
  };
}

// Every user across every organization - only for lookups that have to span orgs (login by
// username, session re-validation by id, username-uniqueness checks). Anything that lists or
// edits users on behalf of a signed-in admin must use loadUsersByOrg instead.
async function loadUsers() {
  if (!db.isConnected) return seedDefaultUsers();
  const { rows } = await db.query('SELECT * FROM users ORDER BY created_at ASC');
  if (rows.length === 0) {
    const seeded = seedDefaultUsers();
    await saveUsers(seeded, DEFAULT_ORG_ID);
    return seeded;
  }
  return rows.map(rowToUser);
}

async function loadUsersByOrg(orgId) {
  return (await loadUsers()).filter(u => u.orgId === orgId);
}

// Full-replace semantics (matches the old redis.set(USERS_KEY, users) behavior) but only
// within `orgId`: any existing user of that org not present in `users` is deleted, the rest
// are upserted - all inside one transaction so a failure partway through can't leave the
// table half-updated. Rows of other organizations are never deleted, and the upsert refuses
// to overwrite a row whose id belongs to another org (org_id is always stamped from `orgId`,
// never taken from `users`).
async function saveUsers(users, orgId) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist users');
  if (!orgId) throw new Error('orgId is required');
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM users WHERE org_id = $2 AND id <> ALL($1::text[])', [users.map(u => u.id), orgId]);
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, username, password_hash, name, role, admin_name, active, created_at, org_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET
           username=EXCLUDED.username, password_hash=EXCLUDED.password_hash, name=EXCLUDED.name,
           role=EXCLUDED.role, admin_name=EXCLUDED.admin_name, active=EXCLUDED.active
         WHERE users.org_id = EXCLUDED.org_id`,
        [u.id, u.username, u.passwordHash, u.name, u.role, u.adminName || null, u.active, u.createdAt, orgId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Never send password hashes to the browser.
function sanitize(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

async function findByUsername(username) {
  const target = (username || '').toLowerCase();
  const users = await loadUsers();
  return users.find(u => u.username.toLowerCase() === target);
}

function verifyPassword(user, plainPassword) {
  if (!user || !user.passwordHash) return false;
  return bcrypt.compareSync(plainPassword || '', user.passwordHash);
}

// public/settings.js always sends the *whole* user list on every add/edit/delete
// (see stgSaveUserModal etc.), with `password` present only when it's being set/changed
// ("leave blank to keep unchanged" in the edit modal) - mirror that contract here instead
// of requiring a client rewrite: keep the existing hash when no plaintext password arrives.
async function syncUsers(incomingUsers, orgId) {
  if (!orgId) throw new Error('orgId is required');
  const allUsers = await loadUsers();
  const existingById = new Map(allUsers.filter(u => u.orgId === orgId).map(u => [u.id, u]));
  const otherOrgUsers = allUsers.filter(u => u.orgId !== orgId);
  const otherOrgIds = new Set(otherOrgUsers.map(u => u.id));
  const otherOrgUsernames = new Set(otherOrgUsers.map(u => u.username.toLowerCase()));

  const merged = incomingUsers.map(incoming => {
    if (otherOrgIds.has(incoming.id)) {
      throw new Error(`User id "${incoming.id}" is not available`);
    }
    const prior = existingById.get(incoming.id);

    // Require a real email as the username for every new account, and for an existing
    // one being renamed - but grandfather in already-existing usernames left unchanged
    // (e.g. the seed "admin" account) so this can't lock anyone out or break a save that
    // merely edits some other user, since public/settings.js always resends the whole list.
    const usernameChanged = !prior || prior.username !== incoming.username;
    if (usernameChanged && !EMAIL_RE.test(incoming.username || '')) {
      throw new Error(`Username "${incoming.username}" must be a valid email address`);
    }

    let passwordHash = prior ? prior.passwordHash : null;
    if (incoming.password) {
      if (incoming.password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password for "${incoming.username}" must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      passwordHash = bcrypt.hashSync(incoming.password, 10);
    }
    if (!passwordHash) {
      throw new Error(`Password is required for new user "${incoming.username}"`);
    }
    return {
      id: incoming.id,
      username: incoming.username,
      passwordHash,
      name: incoming.name,
      role: incoming.role,
      adminName: incoming.adminName || null,
      orgId,
      active: !!incoming.active,
      createdAt: (prior && prior.createdAt) || incoming.createdAt || new Date().toISOString()
    };
  });

  const seenUsernames = new Map();
  merged.forEach(u => {
    const key = u.username.toLowerCase();
    if (otherOrgUsernames.has(key) || (seenUsernames.has(key) && seenUsernames.get(key) !== u.id)) {
      throw new Error(`Username "${u.username}" is already in use`);
    }
    seenUsernames.set(key, u.id);
  });

  await saveUsers(merged, orgId);
  return merged.map(sanitize);
}

// Creates a user account from an approved access request (see api/access-requests/index.js).
// These accounts sign in via Google only, so the password field just needs to satisfy the
// NOT NULL/bcrypt-hash contract every other row already has - the random plaintext is
// discarded immediately and never shown to anyone. A Super Admin can still set a real
// password later from the existing edit-user form if password login is ever wanted too.
async function createUser({ username, name, role, adminName, orgId }) {
  if (!orgId) throw new Error('orgId is required');
  const target = (username || '').toLowerCase();
  if (!EMAIL_RE.test(target)) {
    throw new Error(`Username "${username}" must be a valid email address`);
  }
  const users = await loadUsers();
  if (users.some(u => u.username.toLowerCase() === target)) {
    throw new Error(`Username "${username}" is already in use`);
  }

  const newUser = {
    id: 'id_' + crypto.randomBytes(12).toString('hex'),
    username: target,
    passwordHash: bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10),
    name: name || target,
    role,
    adminName: adminName || null,
    orgId,
    active: true,
    createdAt: new Date().toISOString()
  };

  await saveUsers(users.filter(u => u.orgId === orgId).concat([newUser]), orgId);
  return sanitize(newUser);
}

module.exports = { DEFAULT_ORG_ID, loadUsers, loadUsersByOrg, saveUsers, sanitize, findByUsername, verifyPassword, syncUsers, createUser };
