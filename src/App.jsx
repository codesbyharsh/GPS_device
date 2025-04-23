// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // --- Utility functions inlined ---
  const calculateDistance = (c1, c2) => {
    const R = 6378137; // WGS-84 equatorial radius in meters
    const toRad = deg => (deg * Math.PI) / 180;
    const dLat = toRad(c2.latitude - c1.latitude);
    const dLon = toRad(c2.longitude - c1.longitude);
    const lat1 = toRad(c1.latitude);
    const lat2 = toRad(c2.latitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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

  const lowPassFilter = (currentValue, previousValue, alpha = 0.2) => {
    if (previousValue == null) return currentValue;
    return alpha * currentValue + (1 - alpha) * previousValue;
  };

  // --- State ---
  const [mode, setMode]                 = useState('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [regUsername, setRegUsername]     = useState('');
  const [busNumbers, setBusNumbers]     = useState([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');
  const [username, setUsername]         = useState(localStorage.getItem('username') || '');
  const [deviceId, setDeviceId]         = useState(localStorage.getItem('deviceId') || '');
  const [busNumber, setBusNumber]       = useState(localStorage.getItem('busNumber') || '');
  const [isLoggedIn, setIsLoggedIn]     = useState(!!(localStorage.getItem('username') && localStorage.getItem('deviceId')));
  const [isSharing, setIsSharing]       = useState(false);
  const [waitingForFirstFix, setWaitingForFirstFix] = useState(false);
  const [locationData, setLocationData] = useState({});
  const [messages, setMessages]         = useState([]);
  const [error, setError]               = useState(() =>
    navigator.geolocation ? '' : 'Geolocation not supported by your browser'
  );
  const [showMessages, setShowMessages] = useState(true);

  // --- Refs & Constants ---
  const prevRef     = useRef(null);
  const lastTsRef   = useRef(0);
  const intervalRef = useRef(null);

  const BACKENDURL      = import.meta.env.VITE_BACKENDURL || 'http://localhost:5000';
  const SPEED_THRESHOLD = 1;      // in m/s
  const POLL_INTERVAL   = 1000;   // in ms
  const GEO_OPTIONS     = { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 };

  // --- Load bus numbers ---
  useEffect(() => {
    axios.get(`${BACKENDURL}/api/busNumbers`)
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
  };

  // --- Handle a GPS fix ---
  const handlePosition = pos => {
    if (waitingForFirstFix) setWaitingForFirstFix(false);

    const now = pos.timestamp;                 // use device-provided timestamp
    if (now - lastTsRef.current < 1000) return; // throttle to 1/sec
    lastTsRef.current = now;
    const iso = new Date(now).toISOString();

    const { latitude, longitude, altitude, accuracy } = pos.coords;

    // initialize raw speed & bearing
   
    let spd = pos.coords.speed ?? 0;
    let brg = pos.coords.heading ?? 0;

    const prev = prevRef.current;
    if (prev) {
      const dt   = (now - prev.ts) / 1000;    // sec
      const dist2d = calculateDistance(prev.coords, pos.coords);
      const altDiff = (altitude ?? 0) - (prev.coords.altitude ?? 0);
      const dist3d  = Math.sqrt(dist2d*dist2d + altDiff*altDiff);
      if (spd == null)       spd = dist3d / dt;                      // m/s
      if (brg == null)       brg = calculateBearing(prev.coords, pos.coords);
    }

    const smoothedSpeed   = lowPassFilter(spd, prev?.smoothedSpeed);
    const smoothedHeading = lowPassFilter(brg, prev?.smoothedHeading);

    const status = smoothedSpeed > SPEED_THRESHOLD ? 'moving' : 'stopped';

       // if we’re stopped, keep last heading
        const finalHeading = status === 'stopped'
          ? prev?.smoothedHeading ?? smoothedHeading
          : smoothedHeading;

    const newData = {
      latitude,
      longitude,
      altitude,
      accuracy,
      speed: smoothedSpeed,
      heading: finalHeading,
      status,
      timestamp: iso
    };

    setLocationData(newData);
    prevRef.current = {
      coords: pos.coords,
      ts: now,
      smoothedSpeed,
      smoothedHeading
    };

    axios.post(`${BACKENDURL}/api/location`, { busNumber, deviceId, ...newData })
      .then(() => {
        const t = new Date(now).toLocaleTimeString();
        const msg = `Shared at ${t}: Lat ${latitude.toFixed(5)}, Lon ${longitude.toFixed(5)}, ` +
                    `Speed ${smoothedSpeed.toFixed(1)} m/s (${status}), ` +
                    `Heading ${smoothedHeading.toFixed(1)}°`;
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
    intervalRef.current = null;
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
        <p><strong>Speed:</strong>     {locationData.speed?.toFixed(1) ?? 'N/A'} m/s</p>
        <p><strong>Heading:</strong>   {locationData.heading?.toFixed(1) ?? 'N/A'}°</p>
        <p><strong>Altitude:</strong>  {locationData.altitude ?? 'N/A'} m</p>
        <p><strong>Accuracy:</strong>  {locationData.accuracy ?? 'N/A'} m</p>
        <p><strong>Status:</strong>    {locationData.status ?? 'N/A'}</p>
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
