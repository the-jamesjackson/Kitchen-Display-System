# Kitchen Display System (KDS)

🔗 **[Live Demo](https://kitchen-display-system-pie3.onrender.com/)**

The restaurant that I work at as a part time job got hacked, so both our Kitchen Display System and POS were down. This meant that the front of house team had to write down orders on physical tickets and hand the tickets to me, an expeditor, so that I can individually call out each item on the ticket to the line cooks. As you can imagine, this gets inefficient during a rush, where twenty tickets can get handed to you at once. I decided to create the solution to this problem myself: a lightweight, real-time kitchen display for when your primary KDS/POS goes down.

## Features
- Real-time sync across all connected devices via WebSockets
- Multi-restaurant support — each service is isolated by a 4-digit PIN
- Persistent storage via PostgreSQL — tickets survive server restarts
- Tickets sorted by oldest first so the kitchen always works highest priority first
- Per-item toggling with instant broadcast to all screens
- Bump & unbump — clear completed tickets to a recent history with the ability to restore them
- Prioritize tickets — jumps to the front of the queue with a visual indicator
- Tag individual items — highlights items in blue for attention
- Item notes — optional free-text field per item for modifications or special requests
- End Service — clears all tickets for all connected clients
- Auto-purge — tickets are automatically cleared after 24 hours of inactivity
- Live/Offline connection indicator

## Requirements

- Node.js 18+
- npm 9+
- PostgreSQL database (e.g. [Neon](https://neon.tech))

## Setup

**1. Install dependencies:**
```bash
npm run install:all
```

**2. Create a `.env` file in the `server/` directory:**
```
DATABASE_URL=your_postgres_connection_string
```

**3. Start both servers:**
```bash
npm run dev
```

This starts:
- Backend (Express + Socket.io) → `http://localhost:3001`
- Frontend (Vite + React) → `http://localhost:5173`

**4. Open on any device on the same network:**

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
| Start a service | Click **Start Service**, enter restaurant name, share the PIN with your team |
| Join a service | Click **Join Service**, enter the 4-digit PIN |
| New ticket | Enter table number + items in the left panel, tap **Fire Ticket** |
| Add item notes | Use the Notes field under each item for modifications or special requests |
| Mark item done | Tap any item on a ticket card — syncs instantly to all screens |
| Un-mark item | Tap a done item to toggle it back to pending |
| Tag an item | Tap **Tag** on any item to highlight it in blue |
| Prioritize a ticket | Tap **Prioritize** — moves the ticket to the front of the queue |
| Bump a ticket | Appears when all items are done — tap **Bump** to clear it |
| Unbump a ticket | Tap **Unbump** in the Recently Cleared section to restore it |
| End service | Tap **End Service** in the header — clears everything for all connected clients |

## Architecture

```
/
├── package.json          Root — runs both servers with concurrently
├── server/
│   ├── index.js          Express + Socket.io server
│   └── db.js             PostgreSQL connection, schema setup, query helpers
└── client/
    ├── vite.config.js    Proxies /socket.io → backend
    └── src/
        ├── App.jsx       Socket connection + top-level state
        └── components/
            ├── LandingPage.jsx   Service start/join flow
            ├── TicketForm.jsx    New ticket entry
            └── TicketCard.jsx    Ticket display + actions
```

## Socket events

| Direction | Event | Payload |
|-----------|-------|---------|
| client → server | `create_service` | `{ restaurantName }` |
| client → server | `join_service` | `{ pin }` |
| client → server | `lookup_service` | `{ pin }` |
| client → server | `create_ticket` | `{ table, items[] }` |
| client → server | `toggle_item` | `{ ticketId, itemId }` |
| client → server | `prioritize_ticket` | `{ ticketId }` |
| client → server | `tag_item` | `{ ticketId, itemId }` |
| client → server | `clear_ticket` | `{ ticketId }` |
| client → server | `unbump_ticket` | `{ ticketId }` |
| client → server | `end_service` | — |
| server → client | `service_created` | `{ serviceId, pin, restaurantName }` |
| server → client | `service_joined` | `{ serviceId, restaurantName }` |
| server → client | `service_found` | `{ restaurantName }` |
| server → client | `service_error` | `{ message }` |
| server → client | `service_ended` | — |
| server → room | `init` | `{ tickets[], clearedTickets[] }` |
| server → room | `ticket_created` | `ticket` |
| server → room | `ticket_updated` | `ticket` |
| server → room | `ticket_cleared` | `ticket` |
| server → room | `ticket_unbumped` | `ticket` |

## Deployment

Deployed as a single service on [Render](https://render.com) — the Express server serves the built React client as static files.

- **Build command:** `npm run build`
- **Start command:** `npm start`
- **Environment variable:** `DATABASE_URL` — your Neon connection string
