import { cn } from '../../lib/utils'

const STYLES: Record<string, string> = {
  completed: 'bg-emerald-500/100/15 text-ax-green',
  approved: 'bg-emerald-500/100/15 text-ax-green',
  pass: 'bg-emerald-500/100/15 text-ax-green',
  running: 'bg-ax-primary/100/15 text-ax-blue',
  in_progress: 'bg-ax-primary/100/15 text-ax-blue',
  pending: 'bg-ax-bg-3 text-ax-text-dim',
  rejected: 'bg-red-500/15 text-ax-red',
  error: 'bg-red-500/15 text-ax-red',
  failed: 'bg-red-500/15 text-ax-red',
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase()
  return (
    <span className={cn(
      'font-mono px-1.5 py-0.5 rounded text-[10px] min-w-[60px] text-center inline-block',
      STYLES[key] ?? 'bg-ax-bg-3 text-ax-text-dim',
    )}>
      {status}
    </span>
  )
}
