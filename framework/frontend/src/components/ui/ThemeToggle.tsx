import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { getTheme, toggleTheme, type Theme } from '../../lib/theme'
import { cn } from '../../lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => getTheme())

  useEffect(() => {
    setTheme(getTheme())
  }, [])

  return (
    <button
      type="button"
      onClick={() => setTheme(toggleTheme())}
      className={cn('ax-btn-ghost px-2 py-1', className)}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
