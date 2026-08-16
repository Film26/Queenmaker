// lib/notesStore.js
// Server-side store for "Sales Note" (per-customer free-text note + contact-status
// tags on the Customer InsightHub profile page). Backed by Redis (see lib/redisClient.js),
// same pattern as lib/userStore.js - Vercel's serverless functions have no writable
// persistent local disk. Mirrors the reference app's CustomerNotes sheet shape
// (CustomerKey | CustomerName | Note | Statuses | UpdatedAt | UpdatedBy), stored here as
// one object keyed by CustomerKey instead of sheet rows - it's a "current state" field per
// customer (overwritten on save), not an append-only log.
const { redis } = require('./redisClient');

const NOTES_KEY = 'crm:notes';

async function loadNotes() {
  if (!redis) return {};
  const notes = await redis.get(NOTES_KEY);
  return (notes && typeof notes === 'object') ? notes : {};
}

// customerKey/customerName/note/statuses(pipe-joined string)/requestUser come from the
// client (public/insighthub.js's saveCustomerNote()/updateInlineStatus()/updateInlineNote());
// updatedAt/updatedBy are always stamped here from the server-verified session, never
// trusted from the request body, matching the auth pattern used everywhere else in this app.
async function upsertNote({ customerKey, customerName, note, statuses, updatedBy }) {
  if (!redis) throw new Error('No Redis database connected - cannot persist notes');
  if (!customerKey) throw new Error('customerKey is required');
  const notes = await loadNotes();
  notes[customerKey] = {
    customerKey,
    customerName: customerName || '',
    note: note || '',
    statuses: statuses || '',
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || ''
  };
  await redis.set(NOTES_KEY, notes);
  return notes[customerKey];
}

module.exports = { loadNotes, upsertNote };
