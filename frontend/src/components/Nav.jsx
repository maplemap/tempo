import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../lib/api.js';

const items = [
  { to: '/',          label: 'Timer' },
  { to: '/entries',   label: 'Entries' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings',  label: 'Settings' }
];

export default function Nav() {
  const [current, setCurrent] = useState(null);
  const location = useLocation();

  useEffect(() => {
    api.timer.current()
      .then(({ current }) => setCurrent(current))
      .catch(() => setCurrent(null));
  }, [location.pathname]);

  const tooltip = current
    ? [current.project_name, current.description].filter(Boolean).join(' / ')
    : '';

  return (
    <nav className="nav">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === '/'}
          className={({ isActive }) => `btn${isActive ? ' active' : ''}`}
        >
          [ {it.label} ]
        </NavLink>
      ))}
      {current && (
        <div className="nav-running" data-tooltip={tooltip}>●</div>
      )}
    </nav>
  );
}
