// lib/notesStore.js
// Server-side store for "Sales Note" (per-customer free-text note + contact-status
// tags on the Customer InsightHub profile page). Backed by Postgres (see lib/db.js), same
// pattern as lib/userStore.js - Vercel's serverless functions have no writable persistent
// local disk. Mirrors the reference app's CustomerNotes sheet shape
// (CustomerKey | CustomerName | Note | Statuses | UpdatedAt | UpdatedBy) - it's a "current
// state" row per customer (overwritten on save), not an append-only log.
const db = require('./db');

async function loadNotes() {
  if (!db.isConnected) return {};
  const { rows } = await db.query('SELECT customer_key, customer_name, note, statuses, updated_at, updated_by FROM notes');
  const notes = {};
  rows.forEach(r => {
    notes[r.customer_key] = {
      customerKey: r.customer_key,
      customerName: r.customer_name || '',
      note: r.note || '',
      statuses: r.statuses || '',
      updatedAt: r.updated_at,
      updatedBy: r.updated_by || ''
    };
  });
  return notes;
}

// customerKey/customerName/note/statuses(pipe-joined string)/requestUser come from the
// client (public/insighthub.js's saveCustomerNote()/updateInlineStatus()/updateInlineNote());
// updatedAt/updatedBy are always stamped here from the server-verified session, never
// trusted from the request body, matching the auth pattern used everywhere else in this app.
async function upsertNote({ customerKey, customerName, note, statuses, updatedBy }) {
  if (!db.isConnected) throw new Error('No Postgres database connected - cannot persist notes');
  if (!customerKey) throw new Error('customerKey is required');
  const { rows } = await db.query(
    `INSERT INTO notes (customer_key, customer_name, note, statuses, updated_at, updated_by)
     VALUES ($1,$2,$3,$4, now(), $5)
     ON CONFLICT (customer_key) DO UPDATE SET
       customer_name=EXCLUDED.customer_name, note=EXCLUDED.note, statuses=EXCLUDED.statuses,
       updated_at=now(), updated_by=EXCLUDED.updated_by
     RETURNING customer_key, customer_name, note, statuses, updated_at, updated_by`,
    [customerKey, customerName || '', note || '', statuses || '', updatedBy || '']
  );
  const r = rows[0];
  return {
    customerKey: r.customer_key,
    customerName: r.customer_name || '',
    note: r.note || '',
    statuses: r.statuses || '',
    updatedAt: r.updated_at,
    updatedBy: r.updated_by || ''
  };
}

module.exports = { loadNotes, upsertNote };
