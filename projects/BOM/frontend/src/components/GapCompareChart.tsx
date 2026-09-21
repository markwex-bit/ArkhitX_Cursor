import {
  Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { WaterfallModel } from '../types'
import { colorForFifth } from '../fifthColors'

type Props = { model: WaterfallModel }

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

export default function GapCompareChart({ model }: Props) {
  const n = model.car_totals.length
  const data = model.segments.map((seg) => {
    const baseline = seg.values[0]
    const compare = seg.values[n - 1]
    const gap = compare - baseline
    const row: Record<string, string | number> = {
      label: seg.label,
      baseline,
      compare,
      gap,
      gapPct: model.total_gap !== 0 ? (gap / model.total_gap) * 100 : 0,
    }
    return row
  })

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Side-by-side TPC at {model.segment_level ?? 'analysis level'} — baseline vs compare with gap % of total change
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 12, right: 12, left: 8, bottom: 60 }}>
          <XAxis
            dataKey="label"
            tick={{ fill: '#94a3b8', fontSize: 10 }}
            angle={-25}
            textAnchor="end"
            interval={0}
            height={70}
          />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Tooltip
            formatter={(v: number, name: string) => [fmt(v), name === 'baseline' ? 'Baseline' : 'Compare']}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="baseline" name="Baseline" fill="#4472C4" radius={[2, 2, 0, 0]} />
          <Bar dataKey="compare" name="Compare" fill="#ED7D31" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <table className="w-full mt-4 text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-700">
            <th className="text-left py-1">5th</th>
            <th className="text-right py-1">Baseline</th>
            <th className="text-right py-1">Compare</th>
            <th className="text-right py-1">Gap</th>
            <th className="text-right py-1">% of total gap</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={String(row.label)} className="border-b border-slate-800">
              <td className="py-1 flex items-center gap-1.5">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: colorForFifth(String(row.label), 0) }}
                />
                {row.label}
              </td>
              <td className="py-1 text-right tabular-nums">{fmt(row.baseline as number)}</td>
              <td className="py-1 text-right tabular-nums">{fmt(row.compare as number)}</td>
              <td className={`py-1 text-right tabular-nums ${(row.gap as number) > 0 ? 'text-red-300' : (row.gap as number) < 0 ? 'text-emerald-300' : ''}`}>
                {(row.gap as number) > 0 ? '+' : ''}{fmt(row.gap as number)}
              </td>
              <td className="py-1 text-right tabular-nums">{(row.gapPct as number).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
