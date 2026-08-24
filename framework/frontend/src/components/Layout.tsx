import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../lib/stores/authStore'
import { LayoutDashboard, FolderOpen, Shield, Wrench, LogOut, Boxes } from 'lucide-react'

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
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-blue-400" />
            <h1 className="text-lg font-bold">ArkhitX</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">Governed AI Solutions</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="text-sm text-gray-400 mb-2">{user?.name}</div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
