import { CSSProperties, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function ScrollArea({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  return (
    <div className={cn('overflow-auto scrollbar-thin', className)} style={style}>
      {children}
    </div>
  )
}
