import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function JsonCell({
  value,
  label,
  maxLines,
  variant = 'default',
}: {
  value: unknown
  label?: string
  maxLines?: number
  variant?: 'default' | 'error'
}) {
  const [open, setOpen] = useState(false)
  if (value === null || value === undefined) {
    return <span className="text-ax-text-muted text-[10px]">—</span>
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const limit = maxLines ? maxLines * 40 : 80
  const preview = text.length > limit ? `${text.slice(0, limit)}…` : text
  const tone = variant === 'error' ? 'text-ax-red' : 'text-ax-text-dim'

  return (
    <div className="text-[10px] font-mono">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-start gap-1 text-left hover:text-ax-text w-full ${tone}`}
      >
        {open ? <ChevronDown size={10} className="mt-0.5 shrink-0" /> : <ChevronRight size={10} className="mt-0.5 shrink-0" />}
        <span>{label ? `${label}: ` : ''}{open ? '' : preview}</span>
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-ax-bg rounded border border-ax-border/40 overflow-auto max-h-48 whitespace-pre-wrap text-ax-text-muted">
          {text}
        </pre>
      )}
    </div>
  )
}
