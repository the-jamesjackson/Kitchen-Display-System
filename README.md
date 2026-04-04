# Backup Kitchen Display System (KDS)

A lightweight, real-time kitchen display for when your primary POS/KDS goes down.
No database, no auth, no config — just open the URL and go.

## Requirements

- Node.js 18+
- npm 9+

## Setup

**1. Install dependencies:**
```bash
npm run install:all
```

**2. Start both servers:**
```bash
npm run dev
```

This starts:
- Backend (Socket.io) → `http://localhost:3001`
- Frontend (Vite) → `http://localhost:5173`

**3. Open on any device on the same network:**

On the host machine: `http://localhost:5173`

On iPads / expo screen: `http://<your-ip>:5173`

Find your IP:
```bash
# macOS / Linux
ipconfig getifaddr en0

# Windows
ipconfig
```

## Usage

| Action | How |
|--------|-----|
| New ticket | Enter table number + items in the left panel, tap **Fire Ticket** |
| Mark item done | Tap any item on a ticket card — syncs instantly to all screens |
| Un-mark item | Tap a done item to toggle it back to pending |
| Clear ticket | Appears automatically when all items are done — tap **Clear Ticket** |

## Architecture

```
/
├── package.json          Root — runs both servers with concurrently
├── server/
│   └── index.js          Express + Socket.io, in-memory ticket store
└── client/
    ├── vite.config.js    Proxies /socket.io → backend
    └── src/
        ├── App.jsx       Socket connection + top-level state
        └── components/
            ├── TicketForm.jsx
            └── TicketCard.jsx
```

## Socket events

| Direction | Event | Payload |
|-----------|-------|---------|
| client → server | `create_ticket` | `{ table, items[] }` |
| client → server | `toggle_item` | `{ ticketId, itemId }` |
| client → server | `clear_ticket` | `{ ticketId }` |
| server → all | `init` | `ticket[]` (on connect) |
| server → all | `ticket_created` | `ticket` |
| server → all | `ticket_updated` | `ticket` |
| server → all | `ticket_cleared` | `ticketId` |
