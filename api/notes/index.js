// api/notes/index.js - Vercel serverless function (also mounted directly in server.js for local dev).
// Sales Note API - any logged-in user can read all notes and upsert their own (matches the
// reference app's `notes`/`upsertNote` actions: read is open to any authenticated session,
// write stamps updatedBy from the session rather than trusting the client).
const notesStore = require('../../lib/notesStore');
const auditLog = require('../../lib/auditLog');
const { getAuthorizedUser } = require('../../lib/session');
const { getClientIp } = require('../../lib/reqUtils');

module.exports = async function handler(req, res) {
  const sessionUser = await getAuthorizedUser(req);
  if (!sessionUser) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method === 'GET') {
    const notes = await notesStore.loadNotes();
    return res.status(200).json(notes);
  }

  if (req.method === 'PUT') {
    try {
      const { customerKey, customerName, note, statuses } = req.body || {};
      const saved = await notesStore.upsertNote({
        customerKey,
        customerName,
        note,
        statuses,
        updatedBy: sessionUser.name || sessionUser.username
      });
      await auditLog.append({ type: 'note_updated', userId: sessionUser.id, username: sessionUser.username, ip: getClientIp(req), customerKey });
      return res.status(200).json(saved);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
