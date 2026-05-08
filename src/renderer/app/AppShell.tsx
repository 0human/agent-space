import {
  Bot,
  FolderKanban,
  Gauge,
  KeyRound,
  Layers3,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users
} from 'lucide-react'
import type { ReactElement } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Gauge },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/sessions', label: 'Work Sessions', icon: MessageSquare },
  { to: '/runtimes', label: 'Runtimes', icon: Bot },
  { to: '/profiles', label: 'Profiles', icon: Layers3 },
  { to: '/permissions', label: 'Permissions', icon: ShieldCheck },
  { to: '/teams', label: 'Teams', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings }
]

export function AppShell(): ReactElement {
  return (
    <div className="app-shell">
      <aside className="global-nav" aria-label="Global navigation">
        <div className="brand">
          <KeyRound aria-hidden="true" size={22} />
          <span>Agent Space</span>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              <item.icon aria-hidden="true" size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
      <aside className="inspector" aria-label="Inspector">
        <section>
          <span className="eyebrow">Status</span>
          <h2>Phase 0</h2>
          <p>Project shell is ready for Runtime setup, project flows, and session history.</p>
        </section>
        <section className="metric-list">
          <div>
            <strong>0</strong>
            <span>Runtimes</span>
          </div>
          <div>
            <strong>0</strong>
            <span>Projects</span>
          </div>
          <div>
            <strong>0</strong>
            <span>Running</span>
          </div>
        </section>
      </aside>
    </div>
  )
}
