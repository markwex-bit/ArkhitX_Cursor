import type { GapRow } from '../types'

type Props = {
  rows: GapRow[]
  totalGap: number
  level: string
  baselineLabel: string
  compareLabel: string
  baselineTotal: number
  compareTotal: number
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

const shortLabel = (s: string, max = 48) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export default function GapOverviewChart({
  rows,
  totalGap,
  level,
  baselineLabel,
  compareLabel,
  baselineTotal,
  compareTotal,
}: Props) {
  const data = rows
    .filter((r) => r.side !== 'unchanged')
    .map((r) => {
      const baseline = r.values[0]
      const compare = r.values[r.values.length - 1]
      return {
        label: r.label,
        baseline,
        compare,
        gap: r.gap,
        gapPct: totalGap !== 0 ? (r.gap / totalGap) * 100 : 0,
        side: r.side,
      }
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

  if (!data.length) {
    return <p className="text-slate-400 text-sm">No changes at {level} between the selected costbooks.</p>
  }

  const increases = data.filter((r) => r.gap > 0)
  const decreases = data.filter((r) => r.gap < 0)

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Pivot view at <span className="text-slate-200">{level}</span> — {data.length} categories with a gap
      </p>

      {/* Summary pivot row */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-800/80 text-slate-400 text-xs">
              <th className="text-left py-2 px-3 font-normal w-[28%]"> </th>
              <th className="text-right py-2 px-3 font-normal">Baseline TPC</th>
              <th className="text-right py-2 px-3 font-normal">Compare TPC</th>
              <th className="text-right py-2 px-3 font-normal">Gap</th>
              <th className="text-right py-2 px-3 font-normal w-24">% of gap</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-700 bg-slate-900/60 font-semibold">
              <td className="py-2 px-3 text-slate-200">Total</td>
              <td className="py-2 px-3 text-right tabular-nums">{fmt(baselineTotal)}</td>
              <td className="py-2 px-3 text-right tabular-nums">{fmt(compareTotal)}</td>
              <td className={`py-2 px-3 text-right tabular-nums ${totalGap > 0 ? 'text-red-300' : totalGap < 0 ? 'text-emerald-300' : ''}`}>
                {totalGap > 0 ? '+' : ''}{fmt(totalGap)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-slate-400">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detail pivot — all categories */}
      <div className="overflow-x-auto rounded-lg border border-slate-700 max-h-[min(70vh,720px)] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-800">
            <tr className="text-slate-400 border-b border-slate-600">
              <th className="text-left py-2 px-3 font-normal min-w-[180px]">{level}</th>
              <th className="text-right py-2 px-3 font-normal min-w-[88px]" title={baselineLabel}>
                Baseline
              </th>
              <th className="text-right py-2 px-3 font-normal min-w-[88px]" title={compareLabel}>
                Compare
              </th>
              <th className="text-right py-2 px-3 font-normal min-w-[72px]">Gap</th>
              <th className="text-right py-2 px-3 font-normal min-w-[64px]">% gap</th>
              <th className="text-center py-2 px-3 font-normal w-16">Δ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label} className="border-b border-slate-800/80 hover:bg-slate-800/40">
                <td className="py-1.5 px-3 text-slate-200" title={row.label}>
                  {row.label}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums text-slate-300">{fmt(row.baseline)}</td>
                <td className="py-1.5 px-3 text-right tabular-nums text-slate-300">{fmt(row.compare)}</td>
                <td className={`py-1.5 px-3 text-right tabular-nums font-medium ${row.gap > 0 ? 'text-red-300' : row.gap < 0 ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {row.gap > 0 ? '+' : ''}{fmt(row.gap)}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums text-slate-400">
                  {row.gapPct.toFixed(1)}%
                </td>
                <td className="py-1.5 px-3 text-center text-[10px] uppercase tracking-wide">
                  {row.gap > 0 ? (
                    <span className="text-red-400/90">↑</span>
                  ) : row.gap < 0 ? (
                    <span className="text-emerald-400/90">↓</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-800/95 border-t border-slate-600 text-xs">
            <tr>
              <td className="py-2 px-3 text-slate-400" colSpan={3}>
                Subtotals ({increases.length} ↑ · {decreases.length} ↓)
              </td>
              <td className={`py-2 px-3 text-right tabular-nums font-semibold ${totalGap > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {totalGap > 0 ? '+' : ''}{fmt(totalGap)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-slate-400">100%</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] text-slate-500 leading-snug">
        <span className="text-slate-400">Baseline:</span> {shortLabel(baselineLabel, 56)}
        <span className="mx-2">·</span>
        <span className="text-slate-400">Compare:</span> {shortLabel(compareLabel, 56)}
      </p>
    </div>
  )
}
