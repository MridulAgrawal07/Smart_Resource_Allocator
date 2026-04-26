import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Radio, UserCheck } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/report', label: 'Field Report', icon: Radio },
  { to: '/volunteer', label: 'Volunteer', icon: UserCheck },
];

export default function PortalNav() {
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(true);

  // After sidebar transition ends, nudge Leaflet/other resize listeners
  useEffect(() => {
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 310);
    return () => clearTimeout(id);
  }, [isOpen]);

  return (
    <>
      {/* Desktop: vertical left sidebar */}
      <nav
        className={`portal-nav-sidebar${isOpen ? '' : ' collapsed'}`}
        aria-label="Portal navigation"
      >
        <button
          type="button"
          className="portal-sidebar-header"
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className="portal-sidebar-brand">SRA</span>
          <span className="portal-sidebar-brand-sub">Resource Allocator</span>
        </button>
        <div className="portal-sidebar-links">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `portal-sidebar-link ${isActive ? 'active' : ''}`
              }
              title={!isOpen ? l.label : undefined}
            >
              <l.icon size={17} strokeWidth={2.2} />
              <span className="portal-sidebar-link-label">{l.label}</span>
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
