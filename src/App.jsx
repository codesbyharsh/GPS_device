import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [mode, setMode] = useState('login');
  const [loginUsername, setLoginUsername] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [busNumbers, setBusNumbers] = useState([]);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');

  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [deviceId, setDeviceId] = useState(localStorage.getItem('deviceId') || '');
  const [busNumber, setBusNumber] = useState(localStorage.getItem('busNumber') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(!!username && !!deviceId);
  const [isSharing, setIsSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  
  const [locationData, setLocationData] = useState({
    latitude: null, longitude: null, altitude: null, accuracy: null, speed: null, heading: null, status: null,
  });

  const BACKENDURL = import.meta.env.VITE_BACKENDURL;
  const locationInterval = useRef(null);

  useEffect(() => {
    if (mode === 'register') {
      axios.get(`${BACKENDURL}/api/busNumbers`)
        .then((response) => {
          setBusNumbers(response.data);
          if (!selectedBusNumber && response.data.length > 0) {
            setSelectedBusNumber(response.data[0]);
          }
        })
        .catch((err) => setError('Failed to load bus numbers.'));
    }
  }, [mode, BACKENDURL, selectedBusNumber]);

  const saveConfig = (username, busNumber, deviceId) => {
    localStorage.setItem('username', username);
    localStorage.setItem('busNumber', busNumber);
    localStorage.setItem('deviceId', deviceId);
    setUsername(username);
    setBusNumber(busNumber);
    setDeviceId(deviceId);
    setIsLoggedIn(true);
  };

  const handleRegister = () => {
    if (!regUsername || !selectedBusNumber) {
      setError('Username and bus number are required.');
      return;
    }
    axios.post(`${BACKENDURL}/api/register`, { username: regUsername, busNumber: selectedBusNumber })
      .then(({ data }) => {
        saveConfig(data.username, data.busNumber, data.deviceId);
        setError('');
        setMessages((prev) => [`Registered for bus ${data.busNumber} with Device ID: ${data.deviceId}`, ...prev]);
      })
      .catch((err) => setError(err.response?.data?.message || 'Registration failed.'));
  };

  const handleLogin = () => {
    if (!loginUsername) {
      setError('Username is required.');
      return;
    }
    axios.post(`${BACKENDURL}/api/login`, { username: loginUsername })
      .then(({ data }) => {
        saveConfig(data.username, data.busNumber, data.deviceId);
        setError('');
        setMessages((prev) => [`Logged in as ${data.username} (Bus: ${data.busNumber}, Device ID: ${data.deviceId})`, ...prev]);
      })
      .catch((err) => setError(err.response?.data?.message || 'Login failed.'));
  };

  const sendLocation = (coords) => {
    const { latitude, longitude, speed, heading, altitude, accuracy } = coords;
    const status = speed > 0 ? 'moving' : 'stopped';
    const timestamp = new Date().toISOString();

    axios.post(`${BACKENDURL}/api/location`, {
      busNumber, deviceId, latitude, longitude, altitude, accuracy, speed, heading, timestamp, status,
    })
    .then(() => {
      setMessages((prev) => [
        `Location sent - Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}, Accuracy: ±${accuracy}m`,
        ...prev,
      ]);
    })
    .catch(() => setError('Failed to share location.'));
  };

  const fetchAndSendLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, speed, heading, altitude, accuracy } = position.coords;
        setLocationData({ latitude, longitude, speed, heading, altitude, accuracy, status: speed > 0 ? 'moving' : 'stopped' });
        sendLocation({ latitude, longitude, speed, heading, altitude, accuracy });
      },
      (err) => {
        setError(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (isSharing && isLoggedIn) {
      fetchAndSendLocation();
      locationInterval.current = setInterval(fetchAndSendLocation, 5000);
    } else {
      clearInterval(locationInterval.current);
    }
    return () => clearInterval(locationInterval.current);
  }, [isSharing, isLoggedIn]);

  const handleStart = () => setIsSharing(true);
  const handleStop = () => setIsSharing(false);

  if (!isLoggedIn) {
    return (
      <div className="container">
        <h2>GPS Device Tracker</h2>
        <div className="auth-toggle">
          <button onClick={() => setMode('login')} disabled={mode === 'login'}>Login</button>
          <button onClick={() => setMode('register')} disabled={mode === 'register'}>Register</button>
        </div>
        {mode === 'register' ? (
          <div className="registration">
            <h3>Register</h3>
            <input type="text" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="Username" />
            <select value={selectedBusNumber} onChange={(e) => setSelectedBusNumber(e.target.value)}>
              {busNumbers.map((num, index) => <option key={index} value={num}>{num}</option>)}
            </select>
            <button onClick={handleRegister}>Register Device</button>
          </div>
        ) : (
          <div className="login">
            <h3>Login</h3>
            <input type="text" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="Username" />
            <button onClick={handleLogin}>Login</button>
          </div>
        )}
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="container">
      <h2>GPS Device Tracker</h2>
      <p><strong>Username:</strong> {username}</p>
      <p><strong>Bus:</strong> {busNumber}</p>
      <button onClick={handleStart} disabled={isSharing}>Start Sharing Location</button>
      <button onClick={handleStop} disabled={!isSharing}>Stop Sharing</button>
      <p><strong>Location:</strong> Lat {locationData.latitude?.toFixed(6)}, Lon {locationData.longitude?.toFixed(6)}</p>
      <p><strong>Accuracy:</strong> ±{locationData.accuracy}m</p>
      {messages.map((msg, index) => <p key={index}>{msg}</p>)}
    </div>
  );
}

export default App;
