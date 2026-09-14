import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

const TONE_CLASS: Record<string, string> = {
  High: 'ax-badge-ok',
  Medium: 'ax-badge-warn',
  Low: 'ax-badge-danger',
  Reuse: 'ax-badge-ok',
  Extend: 'ax-badge-warn',
  Rebuild: 'ax-badge-danger',
  'Sunset - No Replacement Needed': 'ax-badge-muted',
  confirmed: 'ax-badge-ok',
  overridden: 'ax-badge-warn',
  needs_more_info: 'ax-badge-muted',
  eligible: 'ax-badge-ok',
  excluded: 'ax-badge-muted',
  shared: 'ax-badge-ok',
  'qlik-only': 'ax-badge-qlik',
  'pbi-only': 'ax-badge-pbi',
}

export default function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = String(tone ?? children)
  return (
    <span className={cn(TONE_CLASS[key] ?? 'ax-badge-muted')}>
      {children}
    </span>
  )
}
