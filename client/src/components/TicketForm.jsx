import { useState } from 'react';

export default function TicketForm({ onSubmit }) {
  const [table, setTable] = useState('');
  const [items, setItems] = useState([{ name: '', quantity: 1 }]);

  const addItem = () => setItems((prev) => [...prev, { name: '', quantity: 1 }]);

  const removeItem = (index) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validItems = items.filter((i) => i.name.trim());
    if (!table || validItems.length === 0) return;
    onSubmit(table, validItems);
    setTable('');
    setItems([{ name: '', quantity: 1 }]);
  };

  return (
    <form className="ticket-form" onSubmit={handleSubmit}>
      <h2>New Ticket</h2>

      <div className="form-group">
        <label htmlFor="table-input">Table</label>
        <input
          id="table-input"
          type="number"
          value={table}
          onChange={(e) => setTable(e.target.value)}
          placeholder="1"
          min="1"
          required
          className="table-input"
          inputMode="numeric"
        />
      </div>

      <div className="form-group">
        <span className="items-label">Items</span>
        {items.map((item, index) => (
          <div key={index} className="item-row">
            <input
              type="number"
              value={item.quantity}
              onChange={(e) =>
                updateItem(index, 'quantity', parseInt(e.target.value, 10) || 1)
              }
              min="1"
              className="qty-input"
              inputMode="numeric"
              aria-label="Quantity"
            />
            <input
              type="text"
              value={item.name}
              onChange={(e) => updateItem(index, 'name', e.target.value)}
              placeholder="Item name"
              className="name-input"
              aria-label="Item name"
            />
            <button
              type="button"
              onClick={() => removeItem(index)}
              className="remove-btn"
              disabled={items.length === 1}
              aria-label="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button type="button" onClick={addItem} className="add-item-btn">
        + Add Item
      </button>

      <button type="submit" className="submit-btn">
        Fire Ticket
      </button>
    </form>
  );
}
