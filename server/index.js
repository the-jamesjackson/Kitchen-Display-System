require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { pool, setup, fetchActiveTickets, fetchClearedTickets } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('/health', (_req, res) => res.sendStatus(200));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const IDLE_PURGE_MS = 24 * 60 * 60 * 1000;

// Check every hour for idle purge
setInterval(async () => {
  const { rows } = await pool.query('SELECT MAX(created_at) AS last FROM tickets');
  const last = rows[0].last;
  if (last && Date.now() - Number(last) > IDLE_PURGE_MS) {
    await pool.query('DELETE FROM tickets');
    io.emit('purged');
  }
}, 60 * 60 * 1000);

io.on('connection', async (socket) => {
  const [tickets, clearedTickets] = await Promise.all([
    fetchActiveTickets(),
    fetchClearedTickets(),
  ]);
  socket.emit('init', { tickets, clearedTickets });

  socket.on('create_ticket', async ({ table, items }) => {
    if (!table || !Array.isArray(items) || items.length === 0) return;

    const ticketId = uuidv4();
    const now = Date.now();

    await pool.query(
      'INSERT INTO tickets (id, table_num, created_at, prioritized, cleared) VALUES ($1, $2, $3, false, false)',
      [ticketId, String(table), now]
    );

    const mappedItems = items.map((item, position) => ({
      id: uuidv4(),
      name: String(item.name).trim(),
      quantity: parseInt(item.quantity, 10) || 1,
      mods: item.mods ? String(item.mods).trim() : '',
      position,
    }));

    for (const item of mappedItems) {
      await pool.query(
        'INSERT INTO ticket_items (id, ticket_id, name, quantity, mods, done, tagged, position) VALUES ($1, $2, $3, $4, $5, false, false, $6)',
        [item.id, ticketId, item.name, item.quantity, item.mods, item.position]
      );
    }

    const ticket = {
      id: ticketId,
      table: String(table),
      createdAt: now,
      prioritized: false,
      items: mappedItems.map((i) => ({ ...i, done: false, tagged: false })),
    };

    io.emit('ticket_created', ticket);
  });

  socket.on('toggle_item', async ({ ticketId, itemId }) => {
    const { rows } = await pool.query('SELECT done FROM ticket_items WHERE id = $1', [itemId]);
    if (rows.length === 0) return;
    const newDone = !rows[0].done;
    await pool.query('UPDATE ticket_items SET done = $1 WHERE id = $2', [newDone, itemId]);

    const { rows: ticketRows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRows.length === 0) return;
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM ticket_items WHERE ticket_id = $1 ORDER BY position ASC',
      [ticketId]
    );
    io.emit('ticket_updated', {
      id: ticketRows[0].id,
      table: ticketRows[0].table_num,
      createdAt: Number(ticketRows[0].created_at),
      prioritized: ticketRows[0].prioritized,
      items: itemRows.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, mods: i.mods, done: i.done, tagged: i.tagged })),
    });
  });

  socket.on('prioritize_ticket', async ({ ticketId }) => {
    const { rows } = await pool.query('SELECT prioritized FROM tickets WHERE id = $1', [ticketId]);
    if (rows.length === 0) return;
    const newVal = !rows[0].prioritized;
    await pool.query('UPDATE tickets SET prioritized = $1 WHERE id = $2', [newVal, ticketId]);

    const { rows: ticketRows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM ticket_items WHERE ticket_id = $1 ORDER BY position ASC',
      [ticketId]
    );
    io.emit('ticket_updated', {
      id: ticketRows[0].id,
      table: ticketRows[0].table_num,
      createdAt: Number(ticketRows[0].created_at),
      prioritized: ticketRows[0].prioritized,
      items: itemRows.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, mods: i.mods, done: i.done, tagged: i.tagged })),
    });
  });

  socket.on('tag_item', async ({ ticketId, itemId }) => {
    const { rows } = await pool.query('SELECT tagged FROM ticket_items WHERE id = $1', [itemId]);
    if (rows.length === 0) return;
    const newVal = !rows[0].tagged;
    await pool.query('UPDATE ticket_items SET tagged = $1 WHERE id = $2', [newVal, itemId]);

    const { rows: ticketRows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRows.length === 0) return;
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM ticket_items WHERE ticket_id = $1 ORDER BY position ASC',
      [ticketId]
    );
    io.emit('ticket_updated', {
      id: ticketRows[0].id,
      table: ticketRows[0].table_num,
      createdAt: Number(ticketRows[0].created_at),
      prioritized: ticketRows[0].prioritized,
      items: itemRows.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, mods: i.mods, done: i.done, tagged: i.tagged })),
    });
  });

  socket.on('clear_ticket', async ({ ticketId }) => {
    const clearedAt = Date.now();
    await pool.query(
      'UPDATE tickets SET cleared = true, cleared_at = $1 WHERE id = $2',
      [clearedAt, ticketId]
    );

    const { rows: ticketRows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRows.length === 0) return;
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM ticket_items WHERE ticket_id = $1 ORDER BY position ASC',
      [ticketId]
    );
    io.emit('ticket_cleared', {
      id: ticketRows[0].id,
      table: ticketRows[0].table_num,
      createdAt: Number(ticketRows[0].created_at),
      prioritized: ticketRows[0].prioritized,
      items: itemRows.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, mods: i.mods, done: i.done, tagged: i.tagged })),
    });
  });

  socket.on('unbump_ticket', async ({ ticketId }) => {
    await pool.query(
      'UPDATE tickets SET cleared = false, cleared_at = NULL WHERE id = $1',
      [ticketId]
    );
    await pool.query(
      'UPDATE ticket_items SET done = false WHERE ticket_id = $1',
      [ticketId]
    );

    const { rows: ticketRows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
    if (ticketRows.length === 0) return;
    const { rows: itemRows } = await pool.query(
      'SELECT * FROM ticket_items WHERE ticket_id = $1 ORDER BY position ASC',
      [ticketId]
    );
    io.emit('ticket_unbumped', {
      id: ticketRows[0].id,
      table: ticketRows[0].table_num,
      createdAt: Number(ticketRows[0].created_at),
      prioritized: ticketRows[0].prioritized,
      items: itemRows.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, mods: i.mods, done: i.done, tagged: i.tagged })),
    });
  });

  socket.on('end_service', async () => {
    await pool.query('DELETE FROM tickets');
    io.emit('purged');
  });
});

const PORT = process.env.PORT || 3001;

setup()
  .then(() => server.listen(PORT, () => console.log(`KDS server listening on port ${PORT}`)))
  .catch((err) => { console.error('DB setup failed:', err); process.exit(1); });
