import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Radio, UserCheck } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Dashboard', sub: 'Coordinator', icon: LayoutDashboard },
  { to: '/report', label: 'Field Report', sub: 'Capture', icon: Radio },
  { to: '/volunteer', label: 'Volunteer', sub: 'Missions', icon: UserCheck },
];

export default function PortalNav() {
  const { pathname } = useLocation();

  return (
    <>
      {/* Desktop: horizontal top strip below topbar */}
      <nav className="portal-nav-desktop" aria-label="Portal navigation">
        <div className="portal-nav-inner">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `portal-link ${isActive ? 'active' : ''}`
              }
            >
              <l.icon size={15} strokeWidth={2.2} />
              <span className="portal-link-label">{l.label}</span>
              <span className="portal-link-sub">{l.sub}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Mobile: bottom tab bar */}
      <nav className="portal-nav-mobile" aria-label="Portal navigation">
        {LINKS.map((l) => {
          const active =
            l.to === '/' ? pathname === '/' : pathname.startsWith(l.to);
          return (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={`portal-tab ${active ? 'active' : ''}`}
            >
              <l.icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span>{l.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
