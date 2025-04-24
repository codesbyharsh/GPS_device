// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const prevLocRef     = useRef(null);
  const prevHeadingRef = useRef(null)
  const [compassHeading, setCompassHeading] = useState(null);
  useEffect(() => {
    function onOrient(e) {
      const h = e.webkitCompassHeading ?? (e.alpha != null ? 360 - e.alpha : null);
      setCompassHeading(h);
    }
    window.addEventListener('deviceorientationabsolute', onOrient, true);
    window.addEventListener('deviceorientation', onOrient, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient);
      window.removeEventListener('deviceorientation', onOrient);
    };
  }, []);

  const calculateDistance = (c1, c2) => {
    const R = 6378137;
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(c2.latitude - c1.latitude);
    const dLon = toRad(c2.longitude - c1.longitude);
    const lat1 = toRad(c1.latitude);
    const lat2 = toRad(c2.latitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const calculateBearing = (c1, c2) => {
    const toRad = deg => (deg * Math.PI) / 180;
    const toDeg = rad => (rad * 180) / Math.PI;
    const lat1 = toRad(c1.latitude);
    const lat2 = toRad(c2.latitude);
    const dLon = toRad(c2.longitude - c1.longitude);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    let brng = toDeg(Math.atan2(y, x));
    return (brng + 360) % 360;
  };

  // kept but not applied
  const lowPassFilter = (currentValue, previousValue, alpha = 0.2) => {
    if (previousValue == null) return currentValue;
    return alpha * currentValue + (1 - alpha) * previousValue;
  };

  // --- State ---
  const [mode, setMode]                   = useState('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [regUsername, setRegUsername]     = useState('');
  const [busNumbers, setBusNumbers]       = useState([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');
  const [username, setUsername]           = useState(localStorage.getItem('username') || '');
  const [deviceId, setDeviceId]           = useState(localStorage.getItem('deviceId') || '');
  const [busNumber, setBusNumber]         = useState(localStorage.getItem('busNumber') || '');
  const [isLoggedIn, setIsLoggedIn]       = useState(!!(localStorage.getItem('username') && localStorage.getItem('deviceId')));
  const [isSharing, setIsSharing]         = useState(false);           // ← add this
  const [waitingForFirstFix, setWaitingForFirstFix] = useState(false);
  const [locationData, setLocationData]   = useState({});
  const [messages, setMessages]           = useState([]);
  const [error, setError]                 = useState(() =>
    navigator.geolocation ? '' : 'Geolocation not supported by your browser'
  );
  const [showMessages, setShowMessages]   = useState(true);

  // --- Refs & Constants ---
  const intervalRef = useRef(null);
  const lastTsRef   = useRef(0);

  const BACKENDURL     = import.meta.env.VITE_BACKENDURL || 'http://localhost:5000';
  const SPEED_THRESHOLD = 1;     // m/s
  const POLL_INTERVAL   = 2000;  // now 2 seconds
  const GEO_OPTIONS     = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 };

  // --- Load bus numbers ---
  useEffect(() => {
        // drop BACKENDURL prefix and rely on Vite proxy
        axios.get('/api/busNumbers')
      .then(({ data }) => setBusNumbers(data))
      .catch(err => console.error('Failed to fetch bus numbers:', err));
  }, [BACKENDURL]);

  // --- Persist / clear user config ---
  const saveConfig = (u, b, d) => {
    localStorage.setItem('username', u);
    localStorage.setItem('busNumber', b);
    localStorage.setItem('deviceId', d);
    setUsername(u);
    setBusNumber(b);
    setDeviceId(d);
    setIsLoggedIn(true);
  };
  const handleLogout = () => {
    localStorage.clear();
    setIsSharing(false);
    setMessages([]);
    setIsLoggedIn(false);
    clearInterval(intervalRef.current);
  };

  // --- Handle a GPS fix ---
  const handlePosition = pos => {
    if (waitingForFirstFix) setWaitingForFirstFix(false);

    const now = pos.timestamp;
    if (now - lastTsRef.current < 1000) return; // throttle 1 Hz
    lastTsRef.current = now;
    // always store full ISO string so `new Date(...)` works
    const iso = new Date(now).toISOString();  
    const { latitude, longitude, altitude, accuracy, heading: geoHeading } = pos.coords;
    
        // → pick the true device heading when available,
        //    otherwise keep last known or fallback to compassHeading
        const headingToUse = geoHeading != null
          ? geoHeading
          : (prevHeadingRef.current ?? compassHeading);
        prevHeadingRef.current = headingToUse;
    
        // → compute speed from last fix → this fix
        let speedCalc = 0;
        if (prevLocRef.current) {
          const dist = calculateDistance(prevLocRef.current, { latitude, longitude });
          const dt   = (pos.timestamp - prevLocRef.current.timestamp) / 1000;
        speedCalc = dt > 0 ? dist / dt : 0;
        }
        prevLocRef.current = { latitude, longitude, timestamp: pos.timestamp };
    
    const payload = {
      busNumber,
      deviceId,
      latitude,
      longitude,
      altitude,
      accuracy,
      heading: headingToUse,
      status: 'unknown',
      timestamp: iso,
      speed: speedCalc
    };

    setLocationData(prev => ({
            ...prev,
            latitude, longitude,
            heading: headingToUse,
            speed: speedCalc,
            timestamp: iso
          }));
    axios.post(`${BACKENDURL}/api/location`, payload)
      .then(({ data }) => {
        const loc = data.location;
        setLocationData(loc);
        const t   = new Date(loc.timestamp).toLocaleTimeString('en-GB', { hour12: false });
        const msg = `At ${t}: Lat ${loc.latitude.toFixed(5)}, Lon ${loc.longitude.toFixed(5)}, ` +
                    `Speed ${loc.speed.toFixed(2)} m/s, Status ${loc.status}`;
        setMessages(m => [msg, ...m.slice(0, 49)]);
      })
      .catch(err => {
        console.error('Location share error:', err);
        setError('Failed to share location.');
      });
  };

  // --- Start / Stop sharing ---
  const handleStartSharing = () => {
    setError('');
    setWaitingForFirstFix(true);

    navigator.geolocation.getCurrentPosition(
      handlePosition,
      err => {
        console.error('Initial fix error:', err);
        setError(`Location error: ${err.message}`);
        setWaitingForFirstFix(false);
      },
      GEO_OPTIONS
    );

    setIsSharing(true);
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        err => console.error('Polling error:', err),
        GEO_OPTIONS
      );
    }, POLL_INTERVAL);
  };
  const handleStopSharing = () => {
    setIsSharing(false);
    clearInterval(intervalRef.current);
  };

  // --- Permission check ---
  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' })
      .then(r => {
        if (r.state === 'denied') {
          setError('Location permissions denied. Please enable in browser settings.');
        }
      });
  }, []);

  // --- Login & Register ---
  const handleLoginSubmit = e => {
    e.preventDefault();
    if (!loginUsername) {
      setError('Username is required.');
      return;
    }
    axios.post(`${BACKENDURL}/api/login`, { username: loginUsername })
      .then(({ data }) => {
        saveConfig(data.username, data.busNumber, data.deviceId);
        setError('');
        setMessages(m => [
          `Logged in as ${data.username} (Bus: ${data.busNumber}, Device ID: ${data.deviceId})`,
          ...m,
        ]);
      })
      .catch(err => {
        console.error('Login error:', err);
        setError(err.response?.data?.message || 'Login failed.');
      });
  };

  const handleRegisterSubmit = e => {
    e.preventDefault();
    if (!regUsername || !selectedBusNumber) {
      setError('Username and bus number are required.');
      return;
    }
    axios.post(`${BACKENDURL}/api/register`, {
      username: regUsername,
      busNumber: selectedBusNumber
    })
      .then(({ data }) => {
        saveConfig(data.username, data.busNumber, data.deviceId);
        setError('');
        setMessages(m => [
          `Registered for bus ${data.busNumber} with Device ID: ${data.deviceId}`,
          ...m
        ]);
      })
      .catch(err => {
        console.error('Registration error:', err);
        setError(err.response?.data?.message || 'Registration failed.');
      });
  };

  const toggleMessages = () => setShowMessages(v => !v);

  // --- Render UI ---
  if (!isLoggedIn) {
    return (
      <div className="container">
        <h2>GPS Device Tracker</h2>
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit}>
            <label>Username</label>
            <input
              value={loginUsername}
              onChange={e => setLoginUsername(e.target.value)}
              placeholder="Enter username"
            />
            <button type="submit">Login</button>
            <p className="toggle-link">
              Don't have an account?{' '}
              <span onClick={() => setMode('register')}>Register here</span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <label>Username</label>
            <input
              value={regUsername}
              onChange={e => setRegUsername(e.target.value)}
              placeholder="Enter username"
            />
            <label>Select Bus</label>
            <select
              value={selectedBusNumber}
              onChange={e => setSelectedBusNumber(e.target.value)}
            >
              <option value="">-- select --</option>
              {busNumbers.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button type="submit" disabled={!selectedBusNumber}>
              Register
            </button>
            <p className="toggle-link">
              Already have an account?{' '}
              <span onClick={() => setMode('login')}>Login here</span>
            </p>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="container">
      <h2>GPS Device Tracker</h2>

      <div className="user-info">
        <p><strong>Username:</strong> {username}</p>
        <p><strong>Bus:</strong> {busNumber}</p>
        <p><strong>Device ID:</strong> {deviceId}</p>
        <button onClick={handleLogout}>Logout</button>
      </div>

      <div className="controls">
        <button onClick={handleStartSharing} disabled={isSharing}>
          Start Sharing
        </button>
        <button onClick={handleStopSharing} disabled={!isSharing}>
          Stop Sharing
        </button>
        {isSharing && waitingForFirstFix && (
          <p className="please-wait">Acquiring & sending location…</p>
        )}
      </div>

      <div className="location-info">
        <p><strong>Latitude:</strong>  {locationData.latitude?.toFixed(5) ?? 'N/A'}</p>
        <p><strong>Longitude:</strong> {locationData.longitude?.toFixed(5) ?? 'N/A'}</p>
        <p><strong>Speed:</strong>     {locationData.speed?.toFixed(2) ?? 'N/A'} m/s</p>
        <p><strong>Heading:</strong>   {locationData.heading?.toFixed(1) ?? 'N/A'}°</p>
        <p><strong>Altitude:</strong>  {locationData.altitude ?? 'N/A'} m</p>
        <p><strong>Accuracy:</strong>  {locationData.accuracy ?? 'N/A'} m</p>
        <p><strong>Status:</strong>    {locationData.status ?? 'N/A'}</p>
        <p><strong>Timestamp:</strong> {locationData.timestamp ? new Date(locationData.timestamp)                .toLocaleTimeString('en-GB', { hour12: false })           : 'N/A'       }</p>
      </div>

      <div className="messages">
        <h4>
          Location Updates{' '}
          <button onClick={toggleMessages}>
            {showMessages ? 'Hide' : 'Show'}
          </button>
        </h4>
        {error && <p className="error">{error}</p>}
        {showMessages && messages.map((m, i) => <p key={i}>{m}</p>)}
      </div>
    </div>
  );
}

export default App;
