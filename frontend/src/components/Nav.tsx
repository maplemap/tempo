import { NavLink } from 'react-router-dom';
import PlansWidget from './PlansWidget';

const items = [
  { to: '/',          label: 'Timer' },
  { to: '/entries',   label: 'Entries' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/settings',  label: 'Settings' }
];

export default function Nav() {
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
      <PlansWidget />
    </nav>
  );
}
