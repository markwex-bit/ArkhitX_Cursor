import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { GapRow } from '../types'

type Props = { rows: GapRow[]; totalGap: number; level: string }

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

export default function GapDriversChart({ rows, totalGap, level }: Props) {
  const data = rows
    .filter((r) => r.side !== 'unchanged')
    .slice(0, 15)
    .map((r) => ({
      label: r.label,
      gap: r.gap,
      gapPct: totalGap !== 0 ? (r.gap / totalGap) * 100 : 0,
      fill: r.gap > 0 ? '#C0392B' : '#1FA187',
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

  if (!data.length) {
    return <p className="text-slate-400 text-sm">No gap drivers at {level}.</p>
  }

  return (
    <div>
      <p className="text-xs text-slate-400 mb-3">
        Horizontal bars — label, gap amount, and % of total gap in one view ({level})
      </p>
      <ResponsiveContainer width="100%" height={Math.max(280, data.length * 36)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 48, top: 8, bottom: 8 }}>
          <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <YAxis
            type="category"
            dataKey="label"
            width={140}
            tick={{ fill: '#e2e8f0', fontSize: 11 }}
          />
          <Tooltip
            formatter={(v: number, _n, p) => [
              `${fmt(v)} (${(p.payload.gapPct as number).toFixed(1)}% of total gap)`,
              'Gap',
            ]}
          />
          <Bar dataKey="gap" radius={[0, 3, 3, 0]} label={{ position: 'right', fill: '#cbd5e1', fontSize: 10, formatter: (v: number) => {
            const row = data.find((d) => d.gap === v)
            const pct = row ? row.gapPct.toFixed(0) : '0'
            return `${v > 0 ? '+' : ''}${fmt(v)} (${pct}%)`
          } }}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
