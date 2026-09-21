import { useMemo, useState } from 'react'
import type { HierarchyGapRow } from '../types'

type Props = {
  rows: HierarchyGapRow[]
  totalGap: number
  baselineLabel: string
  compareLabel: string
  baselineTotal: number
  compareTotal: number
}

type NodeLevel = '5th' | 'l1' | 'l2' | 'l3'

type TreeNode = {
  id: string
  label: string
  level: NodeLevel
  baseline: number
  compare: number
  gap: number
  side: string
  children: TreeNode[]
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })
const shortLabel = (s: string, max = 56) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const FIFTH_ORDER: Record<string, number> = {
  powertrain: 1,
  platform: 2,
  module: 3,
  modules: 3,
  'top hat': 4,
  'tc&other': 5,
  'tc & other': 5,
  other: 5,
}

function fifthSortKey(label: string) {
  return FIFTH_ORDER[label.toLowerCase().trim()] ?? 100
}

function sideOf(gap: number) {
  if (gap > 0) return 'increase'
  if (gap < 0) return 'decrease'
  return 'unchanged'
}

function rollup(id: string, label: string, level: NodeLevel, children: TreeNode[]): TreeNode {
  const baseline = children.reduce((s, c) => s + c.baseline, 0)
  const compare = children.reduce((s, c) => s + c.compare, 0)
  const gap = compare - baseline
  return {
    id,
    label,
    level,
    baseline,
    compare,
    gap,
    side: sideOf(gap),
    children: children.sort((a, b) => {
      if (level === '5th') return fifthSortKey(a.label) - fifthSortKey(b.label) || a.label.localeCompare(b.label)
      return a.label.localeCompare(b.label)
    }),
  }
}

function buildTree(rows: HierarchyGapRow[]): TreeNode[] {
  const fifthMap = new Map<string, HierarchyGapRow[]>()
  for (const row of rows) {
    const fifth = row.fifth ?? '(blank)'
    if (!fifthMap.has(fifth)) fifthMap.set(fifth, [])
    fifthMap.get(fifth)!.push(row)
  }

  const trees: TreeNode[] = []
  for (const [fifth, fRows] of fifthMap) {
    const l1Map = new Map<string, HierarchyGapRow[]>()
    for (const row of fRows) {
      if (!l1Map.has(row.l1)) l1Map.set(row.l1, [])
      l1Map.get(row.l1)!.push(row)
    }

    const l1Nodes: TreeNode[] = []
    for (const [l1, l1Rows] of l1Map) {
      const l2Map = new Map<string, HierarchyGapRow[]>()
      for (const row of l1Rows) {
        if (!l2Map.has(row.l2)) l2Map.set(row.l2, [])
        l2Map.get(row.l2)!.push(row)
      }

      const l2Nodes: TreeNode[] = []
      for (const [l2, l2Rows] of l2Map) {
        const l3Nodes: TreeNode[] = l2Rows.map((row) => {
          const baseline = row.values[0] ?? 0
          const compare = row.values[row.values.length - 1] ?? 0
          const gap = row.gap ?? compare - baseline
          return {
            id: `${fifth}|${l1}|${l2}|${row.l3}`,
            label: row.l3,
            level: 'l3' as const,
            baseline,
            compare,
            gap,
            side: row.side,
            children: [],
          }
        })
        l2Nodes.push(rollup(`${fifth}|${l1}|${l2}`, l2, 'l2', l3Nodes))
      }
      l1Nodes.push(rollup(`${fifth}|${l1}`, l1, 'l1', l2Nodes))
    }
    trees.push(rollup(fifth, fifth, '5th', l1Nodes))
  }

  return trees.sort(
    (a, b) => fifthSortKey(a.label) - fifthSortKey(b.label) || a.label.localeCompare(b.label),
  )
}

type FlatRow = { node: TreeNode; depth: number }

function flattenVisible(nodes: TreeNode[], expanded: Set<string>, depth = 0): FlatRow[] {
  const out: FlatRow[] = []
  for (const node of nodes) {
    out.push({ node, depth })
    if (node.children.length > 0 && expanded.has(node.id)) {
      out.push(...flattenVisible(node.children, expanded, depth + 1))
    }
  }
  return out
}

const LEVEL_LABEL: Record<NodeLevel, string> = {
  '5th': '5th',
  l1: 'L1',
  l2: 'L2',
  l3: 'L3',
}

export default function GapFifthPivot({
  rows,
  totalGap,
  baselineLabel,
  compareLabel,
  baselineTotal,
  compareTotal,
}: Props) {
  const tree = useMemo(() => buildTree(rows), [rows])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visible = flattenVisible(tree, expanded)
  const changedCount = visible.filter(({ node }) => node.side !== 'unchanged').length

  if (!tree.length) {
    return <p className="text-slate-400 text-sm">No hierarchy data for this comparison.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        5th split with expandable L1 → L2 → L3 — click a row to drill down ({tree.length} 5ths)
      </p>

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

      <div className="overflow-x-auto rounded-lg border border-slate-700 max-h-[min(70vh,720px)] overflow-y-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-800">
            <tr className="text-slate-400 border-b border-slate-600">
              <th className="text-left py-2 px-3 font-normal min-w-[220px]">Category</th>
              <th className="text-right py-2 px-3 font-normal min-w-[88px]" title={baselineLabel}>Baseline</th>
              <th className="text-right py-2 px-3 font-normal min-w-[88px]" title={compareLabel}>Compare</th>
              <th className="text-right py-2 px-3 font-normal min-w-[72px]">Gap</th>
              <th className="text-right py-2 px-3 font-normal min-w-[64px]">% gap</th>
              <th className="text-center py-2 px-3 font-normal w-16">Δ</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ node, depth }) => {
              const expandable = node.children.length > 0
              const isExpanded = expanded.has(node.id)
              const gapPct = totalGap !== 0 ? (node.gap / totalGap) * 100 : 0
              const indent = depth * 16

              return (
                <tr
                  key={node.id}
                  className={`border-b border-slate-800/80 hover:bg-slate-800/40 ${
                    node.level === '5th' ? 'bg-slate-900/40 font-medium' : ''
                  } ${node.side === 'unchanged' && node.level === 'l3' ? 'opacity-70' : ''}`}
                >
                  <td className="py-1.5 px-3 text-slate-200">
                    <button
                      type="button"
                      onClick={() => expandable && toggle(node.id)}
                      className={`flex items-center gap-1 text-left w-full ${expandable ? 'cursor-pointer' : 'cursor-default'}`}
                      style={{ paddingLeft: indent }}
                      title={node.label}
                    >
                      <span className="w-4 shrink-0 text-slate-500 text-[10px]">
                        {expandable ? (isExpanded ? '▼' : '▶') : '·'}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1.5 shrink-0">
                        {LEVEL_LABEL[node.level]}
                      </span>
                      <span className="truncate">{node.label}</span>
                    </button>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-300">{fmt(node.baseline)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-300">{fmt(node.compare)}</td>
                  <td
                    className={`py-1.5 px-3 text-right tabular-nums font-medium ${
                      node.gap > 0 ? 'text-red-300' : node.gap < 0 ? 'text-emerald-300' : 'text-slate-400'
                    }`}
                  >
                    {node.gap > 0 ? '+' : ''}{fmt(node.gap)}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-slate-400">
                    {node.side === 'unchanged' ? '—' : `${gapPct.toFixed(1)}%`}
                  </td>
                  <td className="py-1.5 px-3 text-center text-[10px] uppercase tracking-wide">
                    {node.gap > 0 ? (
                      <span className="text-red-400/90">↑</span>
                    ) : node.gap < 0 ? (
                      <span className="text-emerald-400/90">↓</span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-slate-800/95 border-t border-slate-600 text-xs">
            <tr>
              <td className="py-2 px-3 text-slate-400" colSpan={3}>
                {expanded.size ? `${expanded.size} expanded · ${visible.length} visible rows` : 'Expand a 5th to see L1–L3'}
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
        <span className="text-slate-400">Baseline:</span> {shortLabel(baselineLabel)}
        <span className="mx-2">·</span>
        <span className="text-slate-400">Compare:</span> {shortLabel(compareLabel)}
        {changedCount > 0 && (
          <>
            <span className="mx-2">·</span>
            <span>{changedCount} rows with a gap in view</span>
          </>
        )}
      </p>
    </div>
  )
}
