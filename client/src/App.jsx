import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import TicketForm from './components/TicketForm';
import TicketCard from './components/TicketCard';
import LandingPage from './components/LandingPage';

const socket = io();

export default function App() {
  const [session, setSession] = useState(null); // { serviceId, restaurantName }
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

    socket.on('service_ended', () => {
      setSession(null);
      setTickets([]);
      setClearedTickets([]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('init');
      socket.off('ticket_created');
      socket.off('ticket_updated');
      socket.off('ticket_cleared');
      socket.off('ticket_unbumped');
      socket.off('service_ended');
    };
  }, []);

  const handleJoin = (newSession) => {
    setSession(newSession);
  };

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

  const endService = () => {
    if (!window.confirm('Are you sure that you would like to end service? This will clear all active and recent tickets for everyone.')) return;
    socket.emit('end_service');
  };

  const prioritizeTicket = (ticketId) => {
    socket.emit('prioritize_ticket', { ticketId });
  };

  const tagItem = (ticketId, itemId) => {
    socket.emit('tag_item', { ticketId, itemId });
  };

  // Prioritized tickets first, then oldest first within each group
  const sortedTickets = [...tickets].sort((a, b) => {
    if (a.prioritized && !b.prioritized) return -1;
    if (!a.prioritized && b.prioritized) return 1;
    return a.createdAt - b.createdAt;
  });

  if (!session) {
    return <LandingPage socket={socket} onJoin={handleJoin} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>{session.restaurantName}</h1>
        <div className="header-actions">
          <button className="end-service-btn" onClick={endService}>
            End Service
          </button>
          <span className={`connection-badge ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
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
                      onPrioritize={prioritizeTicket}
                      onTagItem={tagItem}
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
