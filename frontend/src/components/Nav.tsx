import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import type { TimerEntry } from '../lib/api';

const items = [
  { to: '/',          label: 'Timer' },
  { to: '/entries',   label: 'Entries' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings',  label: 'Settings' }
];

export default function Nav() {
  const [current, setCurrent] = useState<TimerEntry | null>(null);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const fetch = () =>
      api.timer.current()
        .then(({ current }) => { if (!cancelled) setCurrent(current); })
        .catch(() => { if (!cancelled) setCurrent(null); });

    fetch();
    const id = setInterval(fetch, 5000);
    return () => { cancelled = true; clearInterval(id); };
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
