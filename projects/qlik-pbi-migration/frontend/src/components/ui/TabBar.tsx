import { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

export interface TabItem<T extends string = string> {
  key: T
  label: string
  icon?: LucideIcon
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem<T>[]
  active: T
  onChange: (key: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 flex-shrink-0 overflow-x-auto scrollbar-thin', className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex items-center gap-1 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap',
              isActive
                ? 'border-ax-primary text-ax-primary-light'
                : 'border-transparent text-ax-text-muted hover:text-ax-text-dim hover:border-ax-border',
            )}
          >
            {Icon && <Icon size={13} />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
