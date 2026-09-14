import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

export function ExplanationBanner({ summary, explanation }: { summary: string; explanation: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-4 rounded-lg border border-ax-border/60 bg-ax-bg-2 text-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-ax-bg-3/50 transition-colors"
      >
        <Info className="w-4 h-4 text-ax-primary shrink-0" />
        <span className="font-medium text-ax-text-dim text-xs">{summary}</span>
        <ChevronDown className={cn('w-4 h-4 text-ax-text-muted ml-auto transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-ax-text-muted text-xs leading-relaxed border-t border-ax-border/40">
          {explanation}
        </div>
      )}
    </div>
  )
}
