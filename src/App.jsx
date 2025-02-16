import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {

  const [mode, setMode] = useState('login');

  // Form states
  const [loginUsername, setLoginUsername] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [busNumbers, setBusNumbers] = useState([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');

  // User configuration (from login/registration)
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [deviceId, setDeviceId] = useState(localStorage.getItem('deviceId') || '');
  const [busNumber, setBusNumber] = useState(localStorage.getItem('busNumber') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(
    !!(localStorage.getItem('username') && localStorage.getItem('deviceId'))
  );

  // Location sharing state
  const [isSharing, setIsSharing] = useState(false);
  const [locationData, setLocationData] = useState({});
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [showMessages, setShowMessages] = useState(true);

  // Backend URL (adjust as needed)
  const BACKENDURL = import.meta.env.VITE_BACKENDURL || 'http://localhost:5000';

  // Fetch bus numbers when in registration mode
  useEffect(() => {
    if (mode === 'register') {
      axios
        .get(`${BACKENDURL}/api/busNumbers`)
        .then((response) => {
          setBusNumbers(response.data);
          if (response.data.length > 0 && !selectedBusNumber) {
            setSelectedBusNumber(response.data[0]);
          }
        })
        .catch((err) => {
          console.error('Error fetching bus numbers:', err);
          setError('Failed to load bus numbers.');
        });
    }
  }, [mode, BACKENDURL, selectedBusNumber]);

  // Save user configuration to localStorage and state
  const saveConfig = (username, busNumber, deviceId) => {
    localStorage.setItem('username', username);
    localStorage.setItem('busNumber', busNumber);
    localStorage.setItem('deviceId', deviceId);
    setUsername(username);
    setBusNumber(busNumber);
    setDeviceId(deviceId);
    setIsLoggedIn(true);
  };

  // Handle login form submission
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!loginUsername) {
      setError('Username is required.');
      return;
    }
    axios
      .post(`${BACKENDURL}/api/login`, { username: loginUsername })
      .then((response) => {
        const { username, busNumber, deviceId } = response.data;
        saveConfig(username, busNumber, deviceId);
        setError('');
        setMessages((prev) => [
          `Logged in as ${username} (Bus: ${busNumber}, Device ID: ${deviceId})`,
          ...prev,
        ]);
      })
      .catch((err) => {
        console.error('Login error:', err);
        setError(err.response?.data?.message || 'Login failed.');
      });
  };

  // Handle registration form submission
  const handleRegisterSubmit = (e) => {
    e.preventDefault();
    if (!regUsername || !selectedBusNumber) {
      setError('Username and bus number are required.');
      return;
    }
    axios
      .post(`${BACKENDURL}/api/register`, { username: regUsername, busNumber: selectedBusNumber })
      .then((response) => {
        const { username, busNumber, deviceId } = response.data;
        saveConfig(username, busNumber, deviceId);
        setError('');
        setMessages((prev) => [
          `Registered for bus ${busNumber} with Device ID: ${deviceId}`,
          ...prev,
        ]);
      })
      .catch((err) => {
        console.error('Registration error:', err);
        setError(err.response?.data?.message || 'Registration failed.');
      });
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.clear();
    setUsername('');
    setBusNumber('');
    setDeviceId('');
    setIsLoggedIn(false);
    setIsSharing(false);
    setMessages([]);
    setError('');
    setLoginUsername('');
    setRegUsername('');
  };

  // Toggle visibility of location update messages
  const toggleMessages = () => {
    setShowMessages((prev) => !prev);
  };

  // Share location every 5 seconds when enabled
  useEffect(() => {
    let intervalId;
    if (isSharing && isLoggedIn) {
      const fetchLocation = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, speed, heading, altitude, accuracy } = position.coords;
            const status = speed && speed > 0 ? 'moving' : 'stopped';
            const timestamp = new Date().toISOString();
            const data = { latitude, longitude, speed, heading, altitude, accuracy, status, timestamp };
            setLocationData(data);
            axios
              .post(`${BACKENDURL}/api/location`, { busNumber, deviceId, ...data })
              .then(() => {
                const currentTime = new Date().toLocaleTimeString();
                const msg = `Shared at ${currentTime}: Lat ${latitude.toFixed(5)}, Lon ${longitude.toFixed(
                  5
                )}, Speed ${speed} m/s (${status})`;
                setMessages((prev) => [msg, ...prev]);
              })
              .catch((err) => {
                console.error('Location share error:', err);
                setError('Failed to share location.');
              });
          },
          (err) => {
            console.error('Geolocation error:', err);
            setError(`Error fetching location: ${err.message}`);
          },
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      };
      fetchLocation();
      intervalId = setInterval(fetchLocation, 5000);
    }
    return () => clearInterval(intervalId);
  }, [isSharing, isLoggedIn, BACKENDURL, busNumber, deviceId]);

  const handleStartSharing = () => {
    if (!busNumber) {
      setError('Bus number is required.');
    } else {
      setError('');
      setIsSharing(true);
    }
  };

  const handleStopSharing = () => {
    setIsSharing(false);
  };

  // --- Render Login / Registration UI if not logged in ---
  if (!isLoggedIn) {
    return (
      <div className="container">
        <h2>GPS Device Tracker</h2>
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit}>
            <label htmlFor="loginUsername">Username</label>
            <input
              type="text"
              id="loginUsername"
              placeholder="Enter username"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
            />
            <button type="submit">Login</button>
            <p className="toggle-link">
              Don't have an account? <span onClick={() => setMode('register')}>Register here</span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit}>
            <label htmlFor="regUsername">Username</label>
            <input
              type="text"
              id="regUsername"
              placeholder="Enter username"
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
            />
            <label htmlFor="busSelect">Select Bus Number</label>
            <select
              id="busSelect"
              value={selectedBusNumber}
              onChange={(e) => setSelectedBusNumber(e.target.value)}
            >
              {busNumbers.length > 0 ? (
                busNumbers.map((num, idx) => (
                  <option key={idx} value={num}>
                    {num}
                  </option>
                ))
              ) : (
                <option value="">No buses available</option>
              )}
            </select>
            <button type="submit" disabled={busNumbers.length === 0}>
              Register
            </button>
            <p className="toggle-link">
              Already have an account? <span onClick={() => setMode('login')}>Login here</span>
            </p>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  // --- Render the Main Location Sharing UI if logged in ---
  return (
    <div className="container">
      <h2>GPS Device Tracker</h2>
      <div className="user-info">
        <p>
          <strong>Username:</strong> {username}
        </p>
        <p>
          <strong>Registered Bus:</strong> {busNumber}
        </p>
        <p>
          <strong>Device ID:</strong> {deviceId}
        </p>
        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
      <div className="controls">
        <button onClick={handleStartSharing} disabled={isSharing}>
          Start Sharing Location
        </button>
        <button onClick={handleStopSharing} disabled={!isSharing}>
          Stop Sharing Location
        </button>
      </div>
      <div className="location-info">
        <p>
          <strong>Current Location:</strong>
        </p>
        <p>Latitude: {locationData.latitude ? locationData.latitude.toFixed(5) : 'N/A'}</p>
        <p>Longitude: {locationData.longitude ? locationData.longitude.toFixed(5) : 'N/A'}</p>
        <p>Speed: {locationData.speed !== undefined ? `${locationData.speed} m/s` : 'N/A'}</p>
        <p>Status: {locationData.status || 'N/A'}</p>
      </div>
      <div className="messages">
        <h4>
          Location Updates
          <button onClick={toggleMessages}>{showMessages ? 'Hide' : 'Show'}</button>
        </h4>
        {error && <p className="error">{error}</p>}
        {showMessages && messages.map((msg, idx) => <p key={idx}>{msg}</p>)}
      </div>
    </div>
  );
}

export default App;
