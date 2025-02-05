import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  // Toggle mode: "login" or "register"
  const [mode, setMode] = useState('login');

  // Form state for registration and login
  const [loginUsername, setLoginUsername] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [busNumbers, setBusNumbers] = useState([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');

  // User configuration (from registration or login)
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [deviceId, setDeviceId] = useState(localStorage.getItem('deviceId') || '');
  const [busNumber, setBusNumber] = useState(localStorage.getItem('busNumber') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(!!(localStorage.getItem('username') && localStorage.getItem('deviceId')));

  // Location sharing state
  const [isSharing, setIsSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [locationData, setLocationData] = useState({
    latitude: null,
    longitude: null,
    altitude: null,
    accuracy: null,
    speed: null,
    heading: null,
    status: null,
  });

  // Backend URL from environment variable or fallback
  const BACKENDURL = import.meta.env.VITE_BACKENDURL;

  // When in registration mode, fetch available bus numbers from the server
  useEffect(() => {
    if (mode === 'register') {
      axios
        .get(`${BACKENDURL}/api/busNumbers`)
        .then((response) => {
          setBusNumbers(response.data);
          if (!selectedBusNumber && response.data.length > 0) {
            setSelectedBusNumber(response.data[0]);
          }
        })
        .catch((err) => {
          console.error('Error fetching bus numbers:', err);
          setError('Failed to load bus numbers.');
        });
    }
  }, [mode, BACKENDURL, selectedBusNumber]);

  // Save user configuration in local storage and state
  const saveConfig = (username, busNumber, deviceId) => {
    localStorage.setItem('username', username);
    localStorage.setItem('busNumber', busNumber);
    localStorage.setItem('deviceId', deviceId);
    setUsername(username);
    setBusNumber(busNumber);
    setDeviceId(deviceId);
    setIsLoggedIn(true);
  };

  // Handle registration
  const handleRegister = () => {
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
        console.error('Error registering:', err);
        setError(err.response?.data?.message || 'Registration failed.');
      });
  };

  // Handle login
  const handleLogin = () => {
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
        console.error('Error logging in:', err);
        setError(err.response?.data?.message || 'Login failed.');
      });
  };

  // Function to send location to the backend
  const sendLocation = (coords) => {
    const { latitude, longitude, speed, heading, altitude, accuracy } = coords;
    const status = speed && speed > 0 ? 'moving' : 'stopped';
    const timestamp = new Date().toISOString();

    axios
      .post(`${BACKENDURL}/api/location`, {
        busNumber,
        deviceId,
        latitude,
        longitude,
        altitude,
        accuracy,
        speed,
        heading,
        timestamp,
        status,
      })
      .then(() => {
        const currentTime = new Date().toLocaleTimeString();
        const newMessage = `Location shared at ${currentTime} - Device ID: ${deviceId}, Lat: ${latitude.toFixed(
          5
        )}, Lon: ${longitude.toFixed(5)}, Speed: ${speed} m/s, Heading: ${heading}°, Altitude: ${altitude} m, Accuracy: ±${accuracy} m, Status: ${status}`;
        setMessages((prev) => [newMessage, ...prev]);
      })
      .catch((error) => {
        console.error('Error sharing location:', error);
        setError('Failed to share location.');
      });
  };

  // Start location sharing (every 5 seconds)
  useEffect(() => {
    let intervalId;
    if (isSharing && isLoggedIn) {
      const fetchAndSendLocation = () => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude, speed, heading, altitude, accuracy } = position.coords;
            const status = speed && speed > 0 ? 'moving' : 'stopped';
            setLocationData({ latitude, longitude, speed, heading, altitude, accuracy, status });
            sendLocation({ latitude, longitude, speed, heading, altitude, accuracy });
          },
          (err) => {
            console.error('Error fetching location:', err);
            setError(`Error fetching location: ${err.message}`);
          },
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      };

      fetchAndSendLocation();
      intervalId = setInterval(fetchAndSendLocation, 5000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isSharing, isLoggedIn, BACKENDURL, deviceId, busNumber]);

  const handleStart = () => {
    if (!busNumber) {
      setError('Bus number is required');
    } else {
      setError('');
      setIsSharing(true);
    }
  };

  const handleStop = () => {
    setIsSharing(false);
  };

  // If not logged in, show login/registration forms
  if (!isLoggedIn) {
    return (
      <div className="container">
        <h2>GPS Device Tracker</h2>
        <div className="auth-toggle">
          <button onClick={() => setMode('login')} disabled={mode === 'login'}>
            Login
          </button>
          <button onClick={() => setMode('register')} disabled={mode === 'register'}>
            Register
          </button>
        </div>
        {mode === 'register' ? (
          <div className="registration">
            <h3>Register</h3>
            <label>
              Username:
              <input
                type="text"
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </label>
            <br />
            <label>
              Select Bus Number:
              <select
                value={selectedBusNumber}
                onChange={(e) => setSelectedBusNumber(e.target.value)}
              >
                {busNumbers.length > 0 ? (
                  busNumbers.map((num, index) => (
                    <option key={index} value={num}>
                      {num}
                    </option>
                  ))
                ) : (
                  <option value="">No available buses</option>
                )}
              </select>
            </label>
            <br />
            <button onClick={handleRegister} disabled={busNumbers.length === 0}>
              Register Device
            </button>
          </div>
        ) : (
          <div className="login">
            <h3>Login</h3>
            <label>
              Username:
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
              />
            </label>
            <br />
            <button onClick={handleLogin}>Login</button>
          </div>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );
  }

  // Logged in: show location sharing UI
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
      </div>
      <div className="controls">
        <button onClick={handleStart} disabled={isSharing}>
          Start Sharing Location
        </button>
        <button onClick={handleStop} disabled={!isSharing}>
          Stop Sharing Location
        </button>
      </div>
      <div className="location-info">
        <p>
          <strong>Current Location:</strong> Latitude:{' '}
          {locationData.latitude ? locationData.latitude.toFixed(5) : 'N/A'}, Longitude:{' '}
          {locationData.longitude ? locationData.longitude.toFixed(5) : 'N/A'}
        </p>
        <p>
          <strong>Speed:</strong>{' '}
          {locationData.speed !== null ? locationData.speed + ' m/s' : 'N/A'},{' '}
          <strong>Heading:</strong>{' '}
          {locationData.heading !== null ? locationData.heading + '°' : 'N/A'}
        </p>
        <p>
          <strong>Altitude:</strong>{' '}
          {locationData.altitude !== null ? locationData.altitude + ' m' : 'N/A'},{' '}
          <strong>Accuracy:</strong>{' '}
          {locationData.accuracy !== null ? '±' + locationData.accuracy + ' m' : 'N/A'}
        </p>
        <p>
          <strong>Status:</strong> {locationData.status || 'N/A'}
        </p>
      </div>
      <div className="messages">
        <h4>Location Updates</h4>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {messages.map((msg, index) => (
          <p key={index}>{msg}</p>
        ))}
      </div>
    </div>
  );
}

export default App;
