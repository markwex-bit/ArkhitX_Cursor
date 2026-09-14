import { ReactNode } from 'react'
import { Database } from 'lucide-react'
import { ThemeToggle } from './ui/ThemeToggle'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col bg-ax-bg text-ax-text overflow-hidden">
      <header className="flex-shrink-0 border-b border-ax-border bg-ax-bg-2 px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Database className="w-5 h-5 text-ax-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold leading-none truncate">Qlik → Power BI Migration Assessor</div>
            <div className="text-[9px] text-ax-text-muted uppercase tracking-wider mt-0.5">
              Solution workspace
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>
      <main className="flex-1 overflow-hidden min-h-0">{children}</main>
    </div>
  )
}
