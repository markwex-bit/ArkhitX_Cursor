import { useState } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { cn } from '../../lib/utils'

export function ExplanationBanner({ summary, explanation }: { summary: string; explanation: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3 rounded-lg border border-ax-border/60 bg-ax-bg-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ax-bg-3/50 transition-colors"
      >
        <Info className="w-3.5 h-3.5 text-ax-primary shrink-0" />
        <span className="font-medium text-ax-text-dim text-[11px]">{summary}</span>
        <ChevronDown
          className={cn('w-3.5 h-3.5 text-ax-text-muted ml-auto transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 text-ax-text-muted text-[10px] leading-relaxed border-t border-ax-border/40">
          {explanation}
        </div>
      )}
    </div>
  )
}
