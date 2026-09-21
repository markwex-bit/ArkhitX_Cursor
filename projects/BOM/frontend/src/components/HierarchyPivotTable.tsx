import type { HierarchyGapRow } from '../types'

type Props = {
  rows: HierarchyGapRow[]
  byFifth: boolean
  compareMode: boolean
  totalGap?: number
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

export default function HierarchyPivotTable({ rows, byFifth, compareMode, totalGap = 0 }: Props) {
  if (!rows.length) {
    return <p className="text-slate-400 text-sm">No hierarchy data for this selection.</p>
  }

  const gapPctOfTotal = (gap: number) =>
    totalGap !== 0 ? ((gap / totalGap) * 100).toFixed(1) : '—'

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        {byFifth
          ? 'One row per 5th × L1 × L2 × L3 path — 5th is the cost split, L1–L3 is the product tree.'
          : 'One row per L1 × L2 × L3 path — product hierarchy only (5th not shown).'}
        {' '}{rows.length} rows{compareMode ? ', sorted by L1 → L2 → L3' : ''}.
      </p>

      <div className="overflow-auto rounded-lg border border-slate-700 max-h-[min(70vh,780px)]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-800">
            <tr className="text-slate-400 border-b border-slate-600">
              {byFifth && <th className="text-left py-2 px-3 font-normal min-w-[100px]">5th</th>}
              <th className="text-left py-2 px-3 font-normal min-w-[120px]">L1 Macro System</th>
              <th className="text-left py-2 px-3 font-normal min-w-[120px]">L2 System</th>
              <th className="text-left py-2 px-3 font-normal min-w-[120px]">L3 Subsystem</th>
              {compareMode ? (
                <>
                  <th className="text-right py-2 px-3 font-normal">Baseline</th>
                  <th className="text-right py-2 px-3 font-normal">Compare</th>
                  <th className="text-right py-2 px-3 font-normal">Gap</th>
                  <th className="text-right py-2 px-3 font-normal w-16">% gap</th>
                </>
              ) : (
                <th className="text-right py-2 px-3 font-normal">TPC</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const baseline = row.values[0] ?? 0
              const compare = row.values[row.values.length - 1] ?? 0
              const gap = row.gap ?? 0
              const rowKey = byFifth
                ? `${row.fifth}|${row.l1}|${row.l2}|${row.l3}|${i}`
                : `${row.l1}|${row.l2}|${row.l3}|${i}`

              return (
                <tr
                  key={rowKey}
                  className={`border-b border-slate-800/80 hover:bg-slate-800/30 ${
                    compareMode && row.side === 'unchanged' ? 'opacity-70' : ''
                  }`}
                >
                  {byFifth && (
                    <td className="py-1.5 px-3 text-slate-300">{row.fifth}</td>
                  )}
                  <td className="py-1.5 px-3 text-slate-200">{row.l1}</td>
                  <td className="py-1.5 px-3 text-slate-300">{row.l2}</td>
                  <td className="py-1.5 px-3 text-slate-300">{row.l3}</td>
                  {compareMode ? (
                    <>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(baseline)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(compare)}</td>
                      <td
                        className={`py-1.5 px-3 text-right tabular-nums font-medium ${
                          gap > 0 ? 'text-red-300' : gap < 0 ? 'text-emerald-300' : 'text-slate-400'
                        }`}
                      >
                        {gap > 0 ? '+' : ''}{fmt(gap)}
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-slate-400">
                        {row.side === 'unchanged' ? '—' : `${gapPctOfTotal(gap)}%`}
                      </td>
                    </>
                  ) : (
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmt(baseline)}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
