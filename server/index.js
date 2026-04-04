const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// In-memory ticket store: { [ticketId]: ticket }
const tickets = {};

// Recently cleared tickets — capped at 30, newest first
const clearedTickets = [];

io.on('connection', (socket) => {
  // Hydrate the newly connected client with current state
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
        done: false,
      })),
      createdAt: Date.now(),
    };

    tickets[ticket.id] = ticket;
    io.emit('ticket_created', ticket);
  });

  socket.on('toggle_item', ({ ticketId, itemId }) => {
    const ticket = tickets[ticketId];
    if (!ticket) return;

    const item = ticket.items.find((i) => i.id === itemId);
    if (!item) return;

    item.done = !item.done;
    // Broadcast the full updated ticket so all clients can replace their copy
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

  socket.on('unbump_ticket', ({ ticketId }) => {
    const index = clearedTickets.findIndex((t) => t.id === ticketId);
    if (index === -1) return;
    const [ticket] = clearedTickets.splice(index, 1);
    // Reset all items to pending so the kitchen knows to remake
    ticket.items = ticket.items.map((item) => ({ ...item, done: false }));
    tickets[ticket.id] = ticket;
    io.emit('ticket_unbumped', ticket);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`KDS server listening on port ${PORT}`);
});
