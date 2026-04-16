require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { pool, setup, generatePin, fetchActiveTickets, fetchClearedTickets } = require('./db');

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

// Every hour, purge services with no ticket activity in 24h
setInterval(async () => {
  const { rows } = await pool.query(`
    SELECT s.id FROM services s
    WHERE NOT EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.service_id = s.id AND t.created_at > $1
    ) AND s.created_at < $1
  `, [Date.now() - IDLE_PURGE_MS]);

  for (const { id } of rows) {
    await pool.query('DELETE FROM services WHERE id = $1', [id]);
    io.to(id).emit('service_ended');
  }
}, 60 * 60 * 1000);

// Helper: fetch and format a single ticket by id
async function getTicket(ticketId) {
  const { rows: ticketRows } = await pool.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  if (ticketRows.length === 0) return null;
  const { rows: itemRows } = await pool.query(
    'SELECT * FROM ticket_items WHERE ticket_id = $1 ORDER BY position ASC',
    [ticketId]
  );
  const t = ticketRows[0];
  return {
    id: t.id,
    table: t.table_num,
    createdAt: Number(t.created_at),
    prioritized: t.prioritized,
    items: itemRows.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, mods: i.mods, done: i.done, tagged: i.tagged })),
  };
}

io.on('connection', (socket) => {

  // Look up a service by PIN without joining — for the "Join [name]?" confirmation step
  socket.on('lookup_service', async ({ pin }) => {
    const { rows } = await pool.query('SELECT id, restaurant_name FROM services WHERE pin = $1', [pin]);
    if (rows.length === 0) {
      socket.emit('service_error', { message: 'Invalid PIN. Please try again.' });
      return;
    }
    socket.emit('service_found', { restaurantName: rows[0].restaurant_name });
  });

  // Create a new service session
  socket.on('create_service', async ({ restaurantName }) => {
    if (!restaurantName || !String(restaurantName).trim()) return;
    const id = uuidv4();
    const pin = await generatePin();
    const now = Date.now();
    await pool.query(
      'INSERT INTO services (id, pin, restaurant_name, created_at) VALUES ($1, $2, $3, $4)',
      [id, pin, String(restaurantName).trim(), now]
    );
    socket.serviceId = id;
    socket.join(id);
    socket.emit('service_created', { serviceId: id, pin, restaurantName: String(restaurantName).trim() });
    socket.emit('init', { tickets: [], clearedTickets: [] });
  });

  // Join an existing service session by PIN
  socket.on('join_service', async ({ pin }) => {
    const { rows } = await pool.query('SELECT id, restaurant_name FROM services WHERE pin = $1', [pin]);
    if (rows.length === 0) {
      socket.emit('service_error', { message: 'Invalid PIN. Please try again.' });
      return;
    }
    const { id, restaurant_name } = rows[0];
    socket.serviceId = id;
    socket.join(id);
    const [tickets, clearedTickets] = await Promise.all([
      fetchActiveTickets(id),
      fetchClearedTickets(id),
    ]);
    socket.emit('service_joined', { serviceId: id, restaurantName: restaurant_name });
    socket.emit('init', { tickets, clearedTickets });
  });

  socket.on('create_ticket', async ({ table, items }) => {
    const serviceId = socket.serviceId;
    if (!serviceId || !table || !Array.isArray(items) || items.length === 0) return;

    const ticketId = uuidv4();
    const now = Date.now();

    await pool.query(
      'INSERT INTO tickets (id, service_id, table_num, created_at, prioritized, cleared) VALUES ($1, $2, $3, $4, false, false)',
      [ticketId, serviceId, String(table), now]
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

    io.to(serviceId).emit('ticket_created', ticket);
  });

  socket.on('toggle_item', async ({ ticketId, itemId }) => {
    const serviceId = socket.serviceId;
    if (!serviceId) return;
    const { rows } = await pool.query('SELECT done FROM ticket_items WHERE id = $1', [itemId]);
    if (rows.length === 0) return;
    await pool.query('UPDATE ticket_items SET done = $1 WHERE id = $2', [!rows[0].done, itemId]);
    const ticket = await getTicket(ticketId);
    if (ticket) io.to(serviceId).emit('ticket_updated', ticket);
  });

  socket.on('prioritize_ticket', async ({ ticketId }) => {
    const serviceId = socket.serviceId;
    if (!serviceId) return;
    const { rows } = await pool.query('SELECT prioritized FROM tickets WHERE id = $1', [ticketId]);
    if (rows.length === 0) return;
    await pool.query('UPDATE tickets SET prioritized = $1 WHERE id = $2', [!rows[0].prioritized, ticketId]);
    const ticket = await getTicket(ticketId);
    if (ticket) io.to(serviceId).emit('ticket_updated', ticket);
  });

  socket.on('tag_item', async ({ ticketId, itemId }) => {
    const serviceId = socket.serviceId;
    if (!serviceId) return;
    const { rows } = await pool.query('SELECT tagged FROM ticket_items WHERE id = $1', [itemId]);
    if (rows.length === 0) return;
    await pool.query('UPDATE ticket_items SET tagged = $1 WHERE id = $2', [!rows[0].tagged, itemId]);
    const ticket = await getTicket(ticketId);
    if (ticket) io.to(serviceId).emit('ticket_updated', ticket);
  });

  socket.on('clear_ticket', async ({ ticketId }) => {
    const serviceId = socket.serviceId;
    if (!serviceId) return;
    const clearedAt = Date.now();
    await pool.query('UPDATE tickets SET cleared = true, cleared_at = $1 WHERE id = $2', [clearedAt, ticketId]);
    const ticket = await getTicket(ticketId);
    if (ticket) io.to(serviceId).emit('ticket_cleared', ticket);
  });

  socket.on('unbump_ticket', async ({ ticketId }) => {
    const serviceId = socket.serviceId;
    if (!serviceId) return;
    await pool.query('UPDATE tickets SET cleared = false, cleared_at = NULL WHERE id = $1', [ticketId]);
    await pool.query('UPDATE ticket_items SET done = false WHERE ticket_id = $1', [ticketId]);
    const ticket = await getTicket(ticketId);
    if (ticket) io.to(serviceId).emit('ticket_unbumped', ticket);
  });

  socket.on('end_service', async () => {
    const serviceId = socket.serviceId;
    if (!serviceId) return;
    await pool.query('DELETE FROM services WHERE id = $1', [serviceId]);
    io.to(serviceId).emit('service_ended');
  });
});

const PORT = process.env.PORT || 3001;

setup()
  .then(() => server.listen(PORT, () => console.log(`KDS server listening on port ${PORT}`)))
  .catch((err) => { console.error('DB setup failed:', err); process.exit(1); });
