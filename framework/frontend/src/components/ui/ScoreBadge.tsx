import { cn } from '../../lib/utils'

export function ScoreBadge({ score, na }: { score: number | null; na?: boolean }) {
  if (na) {
    return <span className="text-ax-text-muted text-[10px]">N/A</span>
  }
  if (score === null) {
    return <span className="text-ax-text-muted text-[10px]">—</span>
  }
  const pct = Math.round(score * 100)
  const cls = pct >= 70 ? 'text-ax-green' : pct >= 40 ? 'text-ax-amber' : 'text-ax-red'
  return <span className={cn('font-mono font-semibold text-[10px]', cls)}>{pct}%</span>
}
