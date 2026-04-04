import { useState, useEffect } from 'react';

function useElapsed(createdAt) {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const total = Math.floor((Date.now() - createdAt) / 1000);
      const m = Math.floor(total / 60);
      const s = total % 60;
      setElapsed(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [createdAt]);

  return elapsed;
}

export default function TicketCard({ ticket, onToggleItem, onClear, isCleared, onUnbump }) {
  const allDone = ticket.items.every((item) => item.done);
  const elapsed = useElapsed(ticket.createdAt);

  return (
    <div className={`ticket-card${allDone && !isCleared ? ' ticket-complete' : ''}${isCleared ? ' ticket-cleared' : ''}`}>
      <div className="ticket-header">
        <span className="table-label">Table {ticket.table}</span>
        <span className="elapsed">{elapsed}</span>
      </div>

      <ul className="item-list">
        {ticket.items.map((item) => (
          <li
            key={item.id}
            className={`item ${item.done ? 'item-done' : 'item-pending'}${isCleared ? ' item-no-tap' : ''}`}
            onClick={() => !isCleared && onToggleItem(ticket.id, item.id)}
          >
            <span className="item-qty">×{item.quantity}</span>
            <span className="item-name">
              {item.name}
              {item.mods && <span className="item-mods">{item.mods}</span>}
            </span>
            <span className="item-check">{item.done ? '✓' : ''}</span>
          </li>
        ))}
      </ul>

      {!isCleared && allDone && (
        <button className="clear-btn" onClick={() => onClear(ticket.id)}>
          Bump
        </button>
      )}

      {isCleared && (
        <button className="unbump-btn" onClick={() => onUnbump(ticket.id)}>
          Unbump
        </button>
      )}
    </div>
  );
}
