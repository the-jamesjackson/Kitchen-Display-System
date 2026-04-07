const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('/health', (_req, res) => res.sendStatus(200));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const tickets = {};
const clearedTickets = [];

let lastOrderAt = null;
const IDLE_PURGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function purgeAll() {
  for (const id in tickets) delete tickets[id];
  clearedTickets.splice(0);
  lastOrderAt = null;
  io.emit('purged');
}

// Check every hour — if 24h have passed since the last order, purge
setInterval(() => {
  if (lastOrderAt && Date.now() - lastOrderAt > IDLE_PURGE_MS) {
    purgeAll();
  }
}, 60 * 60 * 1000);

io.on('connection', (socket) => {
  socket.emit('init', {
    tickets: Object.values(tickets).sort((a, b) => a.createdAt - b.createdAt),
    clearedTickets,
  });

  socket.on('create_ticket', ({ table, items }) => {
    if (!table || !Array.isArray(items) || items.length === 0) return;

    const ticket = {
      id: uuidv4(),
      table: String(table),
      items: items.map((item) => ({
        id: uuidv4(),
        name: String(item.name).trim(),
        quantity: parseInt(item.quantity, 10) || 1,
        mods: item.mods ? String(item.mods).trim() : '',
        done: false,
        tagged: false,
      })),
      createdAt: Date.now(),
      prioritized: false,
    };

    tickets[ticket.id] = ticket;
    lastOrderAt = Date.now();
    io.emit('ticket_created', ticket);
  });

  socket.on('toggle_item', ({ ticketId, itemId }) => {
    const ticket = tickets[ticketId];
    if (!ticket) return;

    const item = ticket.items.find((i) => i.id === itemId);
    if (!item) return;

    item.done = !item.done;
    io.emit('ticket_updated', ticket);
  });

  socket.on('prioritize_ticket', ({ ticketId }) => {
    const ticket = tickets[ticketId];
    if (!ticket) return;
    ticket.prioritized = !ticket.prioritized;
    io.emit('ticket_updated', ticket);
  });

  socket.on('tag_item', ({ ticketId, itemId }) => {
    const ticket = tickets[ticketId];
    if (!ticket) return;
    const item = ticket.items.find((i) => i.id === itemId);
    if (!item) return;
    item.tagged = !item.tagged;
    io.emit('ticket_updated', ticket);
  });

  socket.on('clear_ticket', ({ ticketId }) => {
    const ticket = tickets[ticketId];
    if (!ticket) return;
    delete tickets[ticketId];
    clearedTickets.unshift(ticket);
    if (clearedTickets.length > 30) clearedTickets.splice(30);
    io.emit('ticket_cleared', ticket);
  });

  socket.on('end_service', () => {
    purgeAll();
  });

  socket.on('unbump_ticket', ({ ticketId }) => {
    const index = clearedTickets.findIndex((t) => t.id === ticketId);
    if (index === -1) return;
    const [ticket] = clearedTickets.splice(index, 1);
    ticket.items = ticket.items.map((item) => ({ ...item, done: false }));
    tickets[ticket.id] = ticket;
    io.emit('ticket_unbumped', ticket);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`KDS server listening on port ${PORT}`);
});
