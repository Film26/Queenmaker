// lib/orgConfigStore.js
// Server-side store for the Settings page's dropdown lists (Channel / SubChannel / Product /
// SubProduct / Admin, including the Product/SubProduct rawValues mapping the Dashboard's
// filters use), one row per organization in app_config ('settingsConfig:<orgId>'). It used to
// live in each browser's localStorage, so it differed per browser and was shared by every
// account that used the same browser. `orgId` always comes from the server-verified session.
const db = require('./db');

const CATEGORIES = ['Channel', 'SubChannel', 'Product', 'SubProduct', 'Admin'];
// Migration page category thresholds (percent, 0-100) - a single object, not a list.
const MIGRATION_RULES_KEY = 'MigrationRules';
const MIGRATION_RULE_FIELDS = ['vanguardNewMin', 'migrationInflowMin', 'migrationExistingMin', 'retentionInflowMin'];
const MAX_ITEMS_PER_CATEGORY = 1000;
const MAX_CONFIG_CHARS = 1024 * 1024;

const configKey = orgId => 'settingsConfig:' + orgId;

// The saved categories for the org ({} when nothing has been saved yet) - a category that was
// never saved is simply absent so the client can tell "empty list" from "not set up".
async function loadConfig(orgId) {
  if (!db.isConnected) return {};
  if (!orgId) throw new Error('orgId is required');
  const { rows } = await db.query('SELECT value FROM app_config WHERE key = $1', [configKey(orgId)]);
  const value = rows[0] && rows[0].value;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Validates a { Category: [items] } map and returns only the known categories. Items are kept
// as sent (they carry id/name/active and, for Product/SubProduct, rawValues) - only their basic
// shape and overall size are checked.
function cleanConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid config');
  const out = {};
  CATEGORIES.forEach(category => {
    if (!(category in input)) return;
    const items = input[category];
    if (!Array.isArray(items)) throw new Error(`${category} must be a list`);
    if (items.length > MAX_ITEMS_PER_CATEGORY) throw new Error(`${category} has too many items`);
    items.forEach(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string' || typeof item.name !== 'string') {
        throw new Error(`${category} items need an id and a name`);
      }
    });
    out[category] = items;
  });
  if (MIGRATION_RULES_KEY in input) {
    const rules = input[MIGRATION_RULES_KEY];
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) throw new Error(`${MIGRATION_RULES_KEY} must be an object`);
    const cleanRules = {};
    MIGRATION_RULE_FIELDS.forEach(field => {
      const n = Number(rules[field]);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${MIGRATION_RULES_KEY}.${field} must be a number from 0 to 100`);
      cleanRules[field] = n;
    });
    out[MIGRATION_RULES_KEY] = cleanRules;
  }
  if (JSON.stringify(out).length > MAX_CONFIG_CHARS) throw new Error('Config is too large');
  return out;
}

// Merges the given categories into the org's saved config (categories not mentioned are left
// alone) in a single statement, so concurrent saves of different categories don't clobber each other.
async function saveConfig(orgId, input) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist settings');
  if (!orgId) throw new Error('orgId is required');
  const cleaned = cleanConfig(input);
  const { rows } = await db.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = app_config.value || EXCLUDED.value
     RETURNING value`,
    [configKey(orgId), JSON.stringify(cleaned)]
  );
  return rows[0].value;
}

module.exports = { CATEGORIES, MIGRATION_RULES_KEY, loadConfig, saveConfig, cleanConfig };
