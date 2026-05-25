import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import TimerPage from './pages/TimerPage';
import EntriesPage from './pages/EntriesPage';
import DashboardPage from './pages/DashboardPage';
import SettingsPage from './pages/SettingsPage';
import Nav from './components/Nav';
import type { ReactNode } from 'react';

type AuthStatus = 'loading' | 'ok' | 'unauth';

interface AuthState { status: AuthStatus; user: string | null; }

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      {children}
      <Nav />
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', user: null });
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
      <Route path="/settings"  element={<Shell><SettingsPage onLogout={() => setAuth({ status: 'unauth', user: null })} /></Shell>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
