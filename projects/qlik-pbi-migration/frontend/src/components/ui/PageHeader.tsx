import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
}: {
  icon?: LucideIcon
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="ax-page-header">
      <div className="flex items-center gap-3 mb-0">
        {Icon && <Icon className="w-5 h-5 text-ax-primary shrink-0" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold truncate">{title}</h1>
          {subtitle && (
            <p className="text-[10px] text-ax-text-muted truncate">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
