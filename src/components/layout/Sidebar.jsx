import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

const navItems = [
  { section: 'Panoramica', items: [
    { to: '/',          icon: '◈', label: 'Dashboard' },
    { to: '/calendario',icon: '◷', label: 'Calendario' },
    { to: '/cashflow',  icon: '⇄', label: 'Cash Flow' },
  ]},
  { section: 'Ricavi', items: [
    { to: '/progetti',  icon: '◻', label: 'Progetti' },
  ]},
  { section: 'Costi', items: [
    { to: '/professionisti', icon: '◉', label: 'Professionisti' },
    { to: '/costifissi',     icon: '◆', label: 'Costi Fissi' },
    { to: '/rimborsi',       icon: '🧾', label: 'Rimborsi' },
  ]},
  { section: 'Impostazioni', items: [
    { to: '/businessunit', icon: '⬡', label: 'Business Unit' },
  ]},
]

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="brand">Pillole<br />Culinarie</div>
        <div className="sub">Gestione Fatture</div>
      </div>

      <nav style={{ flex: 1 }}>
        {navItems.map(({ section, items }) => (
          <div className="nav-section" key={section}>
            <div className="nav-label">{section}</div>
            {items.map(({ to, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{icon}</span>
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user?.email}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>
          Esci
        </button>
      </div>
    </aside>
  )
}
