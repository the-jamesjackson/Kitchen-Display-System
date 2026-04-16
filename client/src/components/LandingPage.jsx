import { useState, useEffect } from 'react';

export default function LandingPage({ socket, onJoin }) {
  const [view, setView] = useState('home'); // 'home' | 'start' | 'join' | 'confirm' | 'pin-display'
  const [restaurantName, setRestaurantName] = useState('');
  const [pin, setPin] = useState('');
  const [foundRestaurant, setFoundRestaurant] = useState('');
  const [generatedPin, setGeneratedPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    socket.on('service_found', ({ restaurantName: name }) => {
      setFoundRestaurant(name);
      setError('');
      setLoading(false);
      setView('confirm');
    });

    socket.on('service_created', ({ serviceId, pin: p, restaurantName: name }) => {
      setGeneratedPin(p);
      setLoading(false);
      setView('pin-display');
      // Store so we can enter KDS after viewing PIN
      socket._pendingSession = { serviceId, restaurantName: name };
    });

    socket.on('service_joined', ({ serviceId, restaurantName: name }) => {
      setLoading(false);
      onJoin({ serviceId, restaurantName: name });
    });

    socket.on('service_error', ({ message }) => {
      setError(message);
      setLoading(false);
    });

    return () => {
      socket.off('service_found');
      socket.off('service_created');
      socket.off('service_joined');
      socket.off('service_error');
    };
  }, [socket, onJoin]);

  const handleStart = (e) => {
    e.preventDefault();
    if (!restaurantName.trim()) return;
    setLoading(true);
    setError('');
    socket.emit('create_service', { restaurantName: restaurantName.trim() });
  };

  const handleLookup = (e) => {
    e.preventDefault();
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');
    socket.emit('lookup_service', { pin });
  };

  const handleConfirmJoin = () => {
    setLoading(true);
    socket.emit('join_service', { pin });
  };

  const handleEnterKDS = () => {
    const session = socket._pendingSession;
    if (session) {
      delete socket._pendingSession;
      onJoin(session);
    }
  };

  if (view === 'home') {
    return (
      <div className="landing">
        <div className="landing-card">
          <h1 className="landing-title">Kitchen Display System</h1>
          <p className="landing-subtitle">Start a new service or join an existing one</p>
          <div className="landing-actions">
            <button className="landing-btn landing-btn-primary" onClick={() => setView('start')}>
              Start Service
            </button>
            <button className="landing-btn landing-btn-secondary" onClick={() => setView('join')}>
              Join Service
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'start') {
    return (
      <div className="landing">
        <div className="landing-card">
          <button className="landing-back" onClick={() => { setView('home'); setError(''); }}>← Back</button>
          <h2 className="landing-heading">Start Service</h2>
          <form onSubmit={handleStart}>
            <input
              className="landing-input"
              type="text"
              placeholder="Restaurant name"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              autoFocus
            />
            {error && <p className="landing-error">{error}</p>}
            <button className="landing-btn landing-btn-primary" type="submit" disabled={loading || !restaurantName.trim()}>
              {loading ? 'Starting...' : 'Start'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'pin-display') {
    return (
      <div className="landing">
        <div className="landing-card">
          <h2 className="landing-heading">Service Started</h2>
          <p className="landing-subtitle">Share this PIN with your team</p>
          <div className="pin-display">{generatedPin}</div>
          <button className="landing-btn landing-btn-primary" onClick={handleEnterKDS}>
            Enter KDS
          </button>
        </div>
      </div>
    );
  }

  if (view === 'join') {
    return (
      <div className="landing">
        <div className="landing-card">
          <button className="landing-back" onClick={() => { setView('home'); setPin(''); setError(''); }}>← Back</button>
          <h2 className="landing-heading">Join Service</h2>
          <form onSubmit={handleLookup}>
            <input
              className="landing-input landing-input-pin"
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            {error && <p className="landing-error">{error}</p>}
            <button className="landing-btn landing-btn-primary" type="submit" disabled={loading || pin.length !== 4}>
              {loading ? 'Looking up...' : 'Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === 'confirm') {
    return (
      <div className="landing">
        <div className="landing-card">
          <button className="landing-back" onClick={() => { setView('join'); setError(''); }}>← Back</button>
          <h2 className="landing-heading">Join {foundRestaurant}?</h2>
          <div className="landing-actions">
            <button className="landing-btn landing-btn-primary" onClick={handleConfirmJoin} disabled={loading}>
              {loading ? 'Joining...' : 'Join'}
            </button>
            <button className="landing-btn landing-btn-secondary" onClick={() => setView('join')}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
}
