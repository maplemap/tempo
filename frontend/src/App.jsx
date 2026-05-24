import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './lib/api.js';
import LoginPage from './pages/LoginPage.jsx';
import TimerPage from './pages/TimerPage.jsx';
import EntriesPage from './pages/EntriesPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import Nav from './components/Nav.jsx';

function Shell({ children }) {
  return (
    <div className="app">
      {children}
      <Nav />
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState({ status: 'loading', user: null });
  const location = useLocation();

  useEffect(() => {
    api.auth.me()
      .then((d) => setAuth({ status: 'ok', user: d.user }))
      .catch(() => setAuth({ status: 'unauth', user: null }));
  }, []);

  if (auth.status === 'loading') return null;

  if (auth.status !== 'ok') {
    if (location.pathname !== '/login') return <Navigate to="/login" replace />;
    return <LoginPage onLogin={() => setAuth({ status: 'ok', user: 'admin' })} />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/"          element={<Shell><TimerPage /></Shell>} />
      <Route path="/entries"   element={<Shell><EntriesPage /></Shell>} />
      <Route path="/dashboard" element={<Shell><DashboardPage /></Shell>} />
      <Route path="/settings"  element={<Shell><SettingsPage onLogout={() => setAuth({ status: 'unauth' })} /></Shell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
