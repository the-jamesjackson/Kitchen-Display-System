const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function setup() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      table_num TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      prioritized BOOLEAN NOT NULL DEFAULT false,
      cleared BOOLEAN NOT NULL DEFAULT false,
      cleared_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS ticket_items (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      mods TEXT NOT NULL DEFAULT '',
      done BOOLEAN NOT NULL DEFAULT false,
      tagged BOOLEAN NOT NULL DEFAULT false,
      position INTEGER NOT NULL
    );
  `);
}

async function fetchActiveTickets() {
  const { rows: ticketRows } = await pool.query(
    'SELECT * FROM tickets WHERE cleared = false ORDER BY created_at ASC'
  );
  return attachItems(ticketRows);
}

async function fetchClearedTickets() {
  const { rows: ticketRows } = await pool.query(
    'SELECT * FROM tickets WHERE cleared = true ORDER BY cleared_at DESC LIMIT 30'
  );
  return attachItems(ticketRows);
}

async function attachItems(ticketRows) {
  if (ticketRows.length === 0) return [];
  const ids = ticketRows.map((t) => t.id);
  const { rows: itemRows } = await pool.query(
    'SELECT * FROM ticket_items WHERE ticket_id = ANY($1) ORDER BY position ASC',
    [ids]
  );
  return ticketRows.map((t) => formatTicket(t, itemRows.filter((i) => i.ticket_id === t.id)));
}

function formatTicket(t, items) {
  return {
    id: t.id,
    table: t.table_num,
    createdAt: Number(t.created_at),
    prioritized: t.prioritized,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      mods: i.mods,
      done: i.done,
      tagged: i.tagged,
    })),
  };
}

module.exports = { pool, setup, fetchActiveTickets, fetchClearedTickets };
