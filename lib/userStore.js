// lib/userStore.js
// Server-side user store for real authentication (replaces the old client-only
// hardcoded check in index.html). Backed by Redis (see lib/redisClient.js) since
// Vercel's serverless functions have no writable persistent local disk.
const bcrypt = require('bcryptjs');
const { redis } = require('./redisClient');

const USERS_KEY = 'crm:users';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function seedDefaultUsers() {
  // Matches the demo seed user that used to live only in public/settings.js
  // (localStorage), now the single source of truth for login.
  return [{
    id: 'id_seed_admin',
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
    name: 'ผู้ดูแลระบบ',
    role: 'Super Admin',
    active: true,
    createdAt: new Date().toISOString()
  }];
}

async function loadUsers() {
  if (!redis) return seedDefaultUsers();
  const users = await redis.get(USERS_KEY);
  if (Array.isArray(users) && users.length > 0) return users;
  const seeded = seedDefaultUsers();
  await redis.set(USERS_KEY, seeded);
  return seeded;
}

async function saveUsers(users) {
  if (!redis) throw new Error('No Redis database connected - cannot persist users');
  await redis.set(USERS_KEY, users);
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
async function syncUsers(incomingUsers) {
  const existingById = new Map((await loadUsers()).map(u => [u.id, u]));

  const merged = incomingUsers.map(incoming => {
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
      active: !!incoming.active,
      createdAt: (prior && prior.createdAt) || incoming.createdAt || new Date().toISOString()
    };
  });

  const seenUsernames = new Map();
  merged.forEach(u => {
    const key = u.username.toLowerCase();
    if (seenUsernames.has(key) && seenUsernames.get(key) !== u.id) {
      throw new Error(`Username "${u.username}" is already in use`);
    }
    seenUsernames.set(key, u.id);
  });

  await saveUsers(merged);
  return merged.map(sanitize);
}

module.exports = { loadUsers, saveUsers, sanitize, findByUsername, verifyPassword, syncUsers };
