import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import TicketForm from './components/TicketForm';
import TicketCard from './components/TicketCard';

const socket = io();

export default function App() {
  const [tickets, setTickets] = useState([]);
  const [clearedTickets, setClearedTickets] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('init', ({ tickets: active, clearedTickets: cleared }) => {
      setTickets(active);
      setClearedTickets(cleared);
    });

    socket.on('ticket_created', (ticket) => {
      setTickets((prev) => [...prev, ticket]);
    });

    socket.on('ticket_updated', (updatedTicket) => {
      setTickets((prev) => prev.map((t) => (t.id === updatedTicket.id ? updatedTicket : t)));
    });

    socket.on('ticket_cleared', (ticket) => {
      setTickets((prev) => prev.filter((t) => t.id !== ticket.id));
      setClearedTickets((prev) => [ticket, ...prev].slice(0, 30));
    });

    socket.on('ticket_unbumped', (ticket) => {
      setClearedTickets((prev) => prev.filter((t) => t.id !== ticket.id));
      setTickets((prev) => [...prev, ticket]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('init');
      socket.off('ticket_created');
      socket.off('ticket_updated');
      socket.off('ticket_cleared');
      socket.off('ticket_unbumped');
    };
  }, []);

  const createTicket = (table, items) => {
    socket.emit('create_ticket', { table, items });
  };

  const toggleItem = (ticketId, itemId) => {
    socket.emit('toggle_item', { ticketId, itemId });
  };

  const clearTicket = (ticketId) => {
    socket.emit('clear_ticket', { ticketId });
  };

  const unbumpTicket = (ticketId) => {
    socket.emit('unbump_ticket', { ticketId });
  };

  // Oldest tickets first — highest priority for the kitchen
  const sortedTickets = [...tickets].sort((a, b) => a.createdAt - b.createdAt);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Backup KDS</h1>
        <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? 'Live' : 'Offline'}
        </span>
      </header>
      <div className="app-body">
        <aside className="form-panel">
          <TicketForm onSubmit={createTicket} />
        </aside>
        <main className="tickets-panel">
          {sortedTickets.length === 0 && clearedTickets.length === 0 ? (
            <div className="empty-state">No active tickets</div>
          ) : (
            <>
              {sortedTickets.length > 0 && (
                <div className="tickets-grid">
                  {sortedTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onToggleItem={toggleItem}
                      onClear={clearTicket}
                    />
                  ))}
                </div>
              )}

              {clearedTickets.length > 0 && (
                <div className="cleared-section">
                  <div className="cleared-section-label">Recently Cleared</div>
                  <div className="tickets-grid">
                    {clearedTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onToggleItem={() => {}}
                        isCleared
                        onUnbump={unbumpTicket}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
