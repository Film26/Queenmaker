// lib/orgStore.js
// Organizations (see the organizations table in lib/schema.sql). Every user belongs to one
// organization and all org-owned data is keyed by that org's id, so two customers on the same
// deployment never see each other's data.
const db = require('./db');

// Accounts that predate org support - and the seed admin - live in this organization.
const DEFAULT_ORG_ID = 'org_default';

// Which organization should review a Google sign-in from an email that has no account yet:
// the org whose email_domain matches the address's domain, otherwise the default org (the
// behavior before orgs existed). It only decides whose Super Admins see the *request* - the
// person still can't sign in until one of them approves it.
async function resolveOrgIdForEmail(email) {
  if (!db.isConnected) return DEFAULT_ORG_ID;
  const domain = String(email || '').split('@')[1];
  if (!domain) return DEFAULT_ORG_ID;
  const { rows } = await db.query('SELECT id FROM organizations WHERE lower(email_domain) = lower($1) LIMIT 1', [domain]);
  return rows[0] ? rows[0].id : DEFAULT_ORG_ID;
}

module.exports = { DEFAULT_ORG_ID, resolveOrgIdForEmail };
