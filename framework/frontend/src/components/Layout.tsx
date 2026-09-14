import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../lib/stores/authStore'
import { Boxes, FolderOpen, Shield, Wrench, LogOut, LayoutDashboard } from 'lucide-react'
import { cn } from '../lib/utils'
import { ThemeToggle } from './ui/ThemeToggle'

const NAV_ITEMS = [
  { path: '/applications', label: 'Applications', icon: Boxes },
  { path: '/projects', label: 'Projects', icon: FolderOpen },
  { path: '/governance', label: 'Governance', icon: Shield },
  { path: '/tools', label: 'Tools', icon: Wrench },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore()
  const location = useLocation()

  return (
    <div className="h-full flex flex-col bg-ax-bg text-ax-text overflow-hidden">
      {/* Top bar — AIASA-style compact nav */}
      <header className="flex-shrink-0 border-b border-ax-border bg-ax-bg-2 px-4 py-2 flex items-center gap-4">
        <div className="flex items-center gap-2 min-w-[140px]">
          <LayoutDashboard className="w-5 h-5 text-ax-primary" />
          <div>
            <div className="text-sm font-bold leading-none">ArkhitX</div>
            <div className="text-[9px] text-ax-text-muted uppercase tracking-wider">Governance Dashboard</div>
          </div>
        </div>

        <nav className="flex items-center gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-ax-primary/20 text-ax-primary-light'
                    : 'text-ax-text-muted hover:text-ax-text hover:bg-ax-bg-3',
                )}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3 text-xs text-ax-text-muted">
          <ThemeToggle />
          <span className="hidden sm:inline">{user?.name ?? user?.email}</span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-ax-bg-3 hover:text-ax-text transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden min-h-0">
        {children}
      </main>
    </div>
  )
}
