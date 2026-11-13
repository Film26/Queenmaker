// api/config/index.js - Vercel serverless function (also mounted directly in server.js for local dev).
// Settings-page dropdown lists (Channel / SubChannel / Product / SubProduct / Admin), scoped to
// the signed-in user's organization (sessionUser.orgId, from lib/session.js) - there is
// deliberately no way to pass an org id in the request. Any logged-in user can read them (the
// Dashboard's filters and Product mapping need them); only a Super Admin can change them,
// matching who can open the Settings page.
//
// Also serves the org's imported data at /api/data (vercel.json rewrites it to
// ?resource=data, like /api/access-requests) - kept in this file instead of a new one so the
// project stays under the Vercel Hobby plan's serverless function limit.
const orgConfigStore = require('../../lib/orgConfigStore');
const datasetStore = require('../../lib/datasetStore');
const sheetSource = require('../../lib/sheetSource');
const auditLog = require('../../lib/auditLog');
const { DEFAULT_ORG_ID } = require('../../lib/orgStore');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

// GET  ?dataset=main|retention                    -> the committed version's manifest ({ version: null } when none) + linked
// GET  ?dataset=..&version=..&chunk=N            -> that chunk's rows (a Sales Admin gets only rows of their adminName)
// GET  ?action=sources                           -> linked Google Sheets (Super Admin / CEO)
// POST ?dataset=..&action=sync                   -> re-read the linked sheet if due (any role - keeps the dashboard live)
// POST ?dataset=..&action=link   { url }          -> Publish-to-web / Apps Script link: remember it and read it now (Super Admin / CEO)
// POST ?dataset=..&action=prepare-link { url, returnTo } -> regular sheet link: -> { nonce } for the Google sign-in
//      redirect (/api/auth/google/sheets-start?nonce=..), whose callback checks that account can open the sheet and links it
// GET  ?action=link-status&nonce=..               -> outcome of that sign-in, for the person who started it
// POST ?dataset=..&action=unlink                 -> forget the link, keep the data (Super Admin / CEO)
// POST ?dataset=..&action=chunk  { version, index, rows, admins }                     (Super Admin / CEO)
// POST ?dataset=..&action=commit { version, chunkCount, rowCount, baseVersion, mode, sourceName } (Super Admin / CEO)
//      - a file import replaces the dataset, so it also unlinks the sheet (or the next sync would overwrite it)
function forbidden(req, res, sessionUser) {
  auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
  return res.status(403).json({ error: 'Forbidden' });
}

async function handleData(req, res, sessionUser) {
  const q = req.query || {};
  const dataset = q.dataset;
  const canImport = datasetStore.IMPORT_ROLES.indexOf(sessionUser.role) !== -1;

  if (q.action === 'sources' && req.method === 'GET') {
    if (!canImport) return forbidden(req, res, sessionUser);
    const sources = {};
    for (const d of datasetStore.DATASETS) sources[d] = await sheetSource.getSource(sessionUser.orgId, d);
    return res.status(200).json({ sources });
  }
  if (q.action === 'link-status' && req.method === 'GET') {
    const request = await sheetSource.getLinkRequest(q.nonce);
    if (!request || request.userId !== sessionUser.id || request.orgId !== sessionUser.orgId) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ status: request.status, error: request.error, rowCount: request.rowCount, googleEmail: request.googleEmail, dataset: request.dataset, returnTo: request.returnTo });
  }
  if (datasetStore.DATASETS.indexOf(dataset) === -1) return res.status(400).json({ error: 'Unknown dataset' });

  if (req.method === 'GET') {
    const manifest = await datasetStore.getManifest(sessionUser.orgId, dataset);
    if (q.chunk === undefined) {
      const linked = !!(await sheetSource.getSource(sessionUser.orgId, dataset));
      return res.status(200).json(Object.assign({ version: null }, manifest || {}, { linked }));
    }
    const index = Number(q.chunk);
    if (!manifest || manifest.version !== q.version || !Number.isInteger(index)) return res.status(409).json({ error: 'version_changed' });
    const chunk = await datasetStore.readChunk(sessionUser.orgId, dataset, q.version, index);
    if (!chunk) return res.status(409).json({ error: 'version_changed' });
    let rows = chunk.rows;
    if (sessionUser.role === 'Sales Admin') {
      const own = (sessionUser.adminName || '').trim();
      rows = own ? rows.filter((row, i) => chunk.admins[i] === own) : [];
    }
    return res.status(200).json({ rows });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (q.action === 'sync') {
    const result = await sheetSource.syncDataset(sessionUser.orgId, dataset);
    const manifest = await datasetStore.getManifest(sessionUser.orgId, dataset);
    return res.status(200).json({ status: result.status, error: result.error || '', version: manifest ? manifest.version : null });
  }

  if (!canImport) return forbidden(req, res, sessionUser);
  const body = req.body || {};
  try {
    if (q.action === 'prepare-link') {
      const nonce = await sheetSource.createLinkRequest(sessionUser.orgId, dataset, body.url, sessionUser.id, body.returnTo);
      return res.status(200).json({ nonce });
    }
    if (q.action === 'link') {
      // a regular sheet is read with the linking person's Google permission - see prepare-link
      if (sheetSource.parseLink(body.url).kind === 'sheet') return res.status(400).json({ error: 'needs_google' });
      await sheetSource.setSource(sessionUser.orgId, dataset, String(body.url).trim(), sessionUser.username);
      const result = await sheetSource.syncDataset(sessionUser.orgId, dataset, { force: true });
      if (result.status === 'error') {
        await sheetSource.removeSource(sessionUser.orgId, dataset);
        return res.status(400).json({ error: result.error });
      }
      const manifest = await datasetStore.getManifest(sessionUser.orgId, dataset);
      await auditLog.append({ type: 'sheet_linked', orgId: sessionUser.orgId, userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, ip: getClientIp(req), dataset, rowCount: manifest ? manifest.rowCount : 0 });
      return res.status(200).json(Object.assign({}, manifest, { linked: true }));
    }
    if (q.action === 'unlink') {
      await sheetSource.removeSource(sessionUser.orgId, dataset);
      await auditLog.append({ type: 'sheet_unlinked', orgId: sessionUser.orgId, userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, ip: getClientIp(req), dataset });
      return res.status(200).json({ ok: true });
    }
    if (q.action === 'chunk') {
      await datasetStore.addChunk(sessionUser.orgId, dataset, body.version, body.index, body.rows, body.admins);
      return res.status(200).json({ ok: true });
    }
    if (q.action === 'commit') {
      const manifest = await datasetStore.commit(sessionUser.orgId, dataset, body.version, {
        chunkCount: body.chunkCount, rowCount: body.rowCount, baseVersion: body.baseVersion,
        sourceName: body.sourceName, updatedBy: sessionUser.username
      });
      const hadSheet = !!(await sheetSource.getSource(sessionUser.orgId, dataset));
      if (hadSheet) await sheetSource.removeSource(sessionUser.orgId, dataset);
      await auditLog.append({ type: 'data_import', orgId: sessionUser.orgId, userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, ip: getClientIp(req), dataset, mode: 'replace', rowCount: manifest.rowCount, sourceName: manifest.sourceName, unlinkedSheet: hadSheet });
      return res.status(200).json(Object.assign({}, manifest, { linked: false }));
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    if (e instanceof datasetStore.VersionConflictError) return res.status(409).json({ error: 'version_changed' });
    if (e instanceof sheetSource.SheetError) return res.status(400).json({ error: e.message });
    return res.status(400).json({ error: e.message });
  }
}

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.query && req.query.resource === 'data') return handleData(req, res, sessionUser);

  if (req.method === 'GET') {
    const config = await orgConfigStore.loadConfig(sessionUser.orgId);
    // Only the default organization (the original deployment) starts out with the built-in
    // demo lists; every other org starts empty rather than seeing another customer's names.
    return res.status(200).json({ config, useDemoDefaults: sessionUser.orgId === DEFAULT_ORG_ID });
  }

  if (req.method === 'PUT') {
    if (sessionUser.role !== 'Super Admin') {
      auditLog.append({ type: 'unauthorized_access', reason: 'forbidden_role', userId: sessionUser.id, username: sessionUser.username, role: sessionUser.role, path: req.url, method: req.method, ip: getClientIp(req) });
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const body = req.body || {};
      const config = await orgConfigStore.saveConfig(sessionUser.orgId, body.config);
      await auditLog.append({ type: 'settings_config_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req), categories: Object.keys(orgConfigStore.cleanConfig(body.config)) });
      return res.status(200).json({ config });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
