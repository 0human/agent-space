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
    <div className="grid min-h-screen grid-cols-1 bg-background text-foreground md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px]">
      <aside
        className="hidden bg-[#171b20] px-3.5 py-5 text-white md:block"
        aria-label="Global navigation"
      >
        <div className="mb-6 flex items-center justify-center gap-2.5 font-bold xl:justify-start">
          <KeyRound aria-hidden="true" size={22} />
          <span className="hidden xl:inline">Agent Space</span>
        </div>
        <nav className="grid gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'flex min-h-10 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-slate-300 no-underline transition-colors hover:bg-slate-700 hover:text-white xl:justify-start',
                  isActive ? 'bg-slate-700 text-white' : ''
                ].join(' ')
              }
            >
              <item.icon aria-hidden="true" size={18} />
              <span className="hidden xl:inline">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 p-4 md:p-6">
        <Outlet />
      </main>
      <aside className="hidden border-l border-border bg-card p-6 xl:block" aria-label="Inspector">
        <section>
          <span className="text-xs font-bold uppercase text-muted-foreground">Status</span>
          <h2 className="mt-1 text-xl font-semibold">Phase 2</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Runtime setup is available. Project flows and session history come next.
          </p>
        </section>
        <section className="mt-7 grid gap-3">
          <div className="flex items-center justify-between">
            <strong className="text-2xl">0</strong>
            <span className="text-muted-foreground">Runtimes</span>
          </div>
          <div className="flex items-center justify-between">
            <strong className="text-2xl">0</strong>
            <span className="text-muted-foreground">Projects</span>
          </div>
          <div className="flex items-center justify-between">
            <strong className="text-2xl">0</strong>
            <span className="text-muted-foreground">Running</span>
          </div>
        </section>
      </aside>
    </div>
  )
}
