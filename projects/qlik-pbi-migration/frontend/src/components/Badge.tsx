import type { ReactNode } from 'react'

const COLORS: Record<string, string> = {
  High: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Medium: 'bg-amber-100 text-amber-800 border-amber-300',
  Low: 'bg-rose-100 text-rose-800 border-rose-300',
  Reuse: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  Extend: 'bg-amber-100 text-amber-800 border-amber-300',
  Rebuild: 'bg-rose-100 text-rose-800 border-rose-300',
  'Sunset - No Replacement Needed': 'bg-slate-200 text-slate-700 border-slate-300',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  overridden: 'bg-amber-100 text-amber-800 border-amber-300',
  needs_more_info: 'bg-slate-200 text-slate-700 border-slate-300',
  eligible: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  excluded: 'bg-slate-200 text-slate-600 border-slate-300',
}

export default function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const classes = COLORS[String(tone ?? children)] ?? 'bg-slate-100 text-slate-700 border-slate-300'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${classes}`}
    >
      {children}
    </span>
  )
}
