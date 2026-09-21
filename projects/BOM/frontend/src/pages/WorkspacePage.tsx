import { useEffect, useMemo, useState } from 'react'
import {
  calculateComparison,
  downloadCostbookReport,
  downloadGapReport,
  explainComparison,
  getCatalog,
  getFilterOptions,
  getMeta,
  saveBlob,
} from '../api'
import type { ComparisonResult, CostbookRef } from '../types'
import { colorForFifth } from '../fifthColors'
import WaterfallChart from '../components/WaterfallChart'
import GapDriversChart from '../components/GapDriversChart'
import GapCompareChart from '../components/GapCompareChart'
import GapFifthPivot from '../components/GapFifthPivot'
import CostAnalysisPanel, { COST_ANALYSIS_DEFAULT_FILTERS } from '../components/CostAnalysisPanel'
import DataExplorerPanel, { EXPLORER_DEFAULT_FILTERS, loadExplorerFilterOptions } from '../components/DataExplorerPanel'
import type { ExplorerFilters } from '../components/DataExplorerPanel'
import HierarchyPivotTable from '../components/HierarchyPivotTable'
import GapFilterBar, { type GapCatalogFilters } from '../components/GapFilterBar'
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

type Tab = 'gap_overview' | 'cost_analysis' | 'data_explorer' | 'gap' | 'gap_bars' | 'gap_compare' | 'systems' | 'parts' | 'full_bom' | 'aligned' | 'hierarchy_l123' | 'hierarchy_5th'

const GAP_TABS: Tab[] = ['gap_overview', 'gap', 'gap_bars', 'gap_compare']

const TAB_LABELS: Record<Tab, string> = {
  gap_overview: 'Gap pivot',
  cost_analysis: 'Cost analysis',
  data_explorer: 'Data explorer',
  gap: 'Gap waterfall',
  gap_bars: 'Gap drivers',
  gap_compare: 'Gap compare',
  systems: 'Systems',
  parts: 'Parts',
  full_bom: 'Full BOM',
  aligned: 'Aligned',
  hierarchy_l123: 'L1–L3',
  hierarchy_5th: 'L1–L3 by 5th',
}

const fmtTpc = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

function renderFifthPieLabels(props: {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  label?: string
  tpc?: number
  pct?: number
}) {
  const {
    cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, label = '', tpc = 0, pct = 0,
  } = props
  const RADIAN = Math.PI / 180
  const cos = Math.cos(-midAngle * RADIAN)
  const sin = Math.sin(-midAngle * RADIAN)
  const insideR = innerRadius + (outerRadius - innerRadius) * 0.52
  const insideX = Math.round(cx + insideR * cos)
  const insideY = Math.round(cy + insideR * sin)
  const outsideR = outerRadius + 22
  const outsideX = Math.round(cx + outsideR * cos)
  const outsideY = Math.round(cy + outsideR * sin)
  const showInside = pct >= 0.06
  const insideText = `${Math.round(pct * 100)}%`

  return (
    <g style={{ pointerEvents: 'none' }}>
      {showInside && (
        <text
          x={insideX}
          y={insideY}
          fill="#e2e8f0"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10}
          style={{ textRendering: 'geometricPrecision' }}
        >
          {insideText}
        </text>
      )}
      <text
        x={outsideX}
        y={outsideY}
        fill="#e2e8f0"
        textAnchor={outsideX > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={11}
        style={{ textRendering: 'geometricPrecision' }}
      >
        {`${label}: ${fmtTpc(tpc)}`}
      </text>
    </g>
  )
}

const cbKey = (c: CostbookRef) => `${c.vehicle_code}|${c.milestone}|${c.milestone_date}`

const DEFAULT_GAP_FILTERS: GapCatalogFilters = {
  region: '(All)',
  carline_type: '(All)',
  platform: '(All)',
  powertrain: '(All)',
  milestone: '(All)',
}

const matchesQuery = (cb: CostbookRef, q: string) => {
  const hay = [cb.vehicle_code, cb.project, cb.milestone, cb.milestone_date, cb.platform, cb.region]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

export default function WorkspacePage() {
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [slots, setSlots] = useState<(CostbookRef | null)[]>([null, null, null, null, null])
  const strip = useMemo(
    () => slots.filter((s): s is CostbookRef => s !== null),
    [slots],
  )
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [tab, setTab] = useState<Tab>('systems')
  const [level, setLevel] = useState('5th')
  const [currency, setCurrency] = useState('(Source currency)')
  const [loading, setLoading] = useState(false)
  const [explainQ, setExplainQ] = useState('')
  const [explainA, setExplainA] = useState('')
  const [catalog, setCatalog] = useState<CostbookRef[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [levelNames, setLevelNames] = useState<string[]>([])
  const [currencyChoices, setCurrencyChoices] = useState<string[]>(['(Source currency)'])
  const [gapFilters, setGapFilters] = useState<GapCatalogFilters>(DEFAULT_GAP_FILTERS)
  const [costFilters, setCostFilters] = useState<GapCatalogFilters>(COST_ANALYSIS_DEFAULT_FILTERS)
  const [explorerFilters, setExplorerFilters] = useState<ExplorerFilters>(EXPLORER_DEFAULT_FILTERS)
  const [filterOptions, setFilterOptions] = useState<Record<keyof GapCatalogFilters, string[]>>({
    region: ['(All)'],
    carline_type: ['(All)'],
    platform: ['(All)'],
    powertrain: ['(All)'],
    milestone: ['(All)'],
  })
  const [costFilterOptions, setCostFilterOptions] = useState<Record<keyof GapCatalogFilters, string[]>>({
    region: ['(All)'],
    carline_type: ['(All)'],
    platform: ['(All)'],
    powertrain: ['(All)'],
    milestone: ['(All)'],
  })
  const [explorerFilterOptions, setExplorerFilterOptions] = useState<Awaited<ReturnType<typeof loadExplorerFilterOptions>>>({
    region: ['(All)'],
    carline_type: ['(All)'],
    platform: ['(All)'],
    powertrain: ['(All)'],
    milestone: ['(All)'],
    project: ['(All)'],
    brand: ['(All)'],
    control_owner: ['(All)'],
  })

  const filterQueryParams = (f: GapCatalogFilters, exclude?: keyof GapCatalogFilters) => {
    const p: Record<string, string> = {}
    ;(Object.keys(f) as (keyof GapCatalogFilters)[]).forEach((k) => {
      if (k !== exclude && f[k] !== '(All)') p[k] = f[k]
    })
    return p
  }

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return catalog
    return catalog.filter((cb) => matchesQuery(cb, q))
  }, [catalog, searchQuery])

  const runCatalogSearch = () => {
    setSearchQuery(searchInput)
    setCatalogOpen(true)
  }

  useEffect(() => {
    getMeta().then((m) => {
      setLevelNames(m.level_names)
      setCurrencyChoices(m.currency_choices)
    })
  }, [])

  useEffect(() => {
    setCatalogLoading(true)
    setCatalogError('')
    getCatalog({}, currency)
      .then((items) => setCatalog(items))
      .catch(() => setCatalogError('Could not load catalog — is the backend running on port 8010?'))
      .finally(() => setCatalogLoading(false))
  }, [currency])

  useEffect(() => {
    if (!GAP_TABS.includes(tab)) return
    const fields = Object.keys(DEFAULT_GAP_FILTERS) as (keyof GapCatalogFilters)[]
    Promise.all(
      fields.map(async (field) => {
        const opts = await getFilterOptions(field, filterQueryParams(gapFilters, field))
        return [field, opts] as const
      }),
    ).then((entries) => {
      setFilterOptions((prev) => {
        const next = { ...prev }
        entries.forEach(([field, opts]) => { next[field] = opts })
        return next
      })
    })
  }, [tab, gapFilters])

  useEffect(() => {
    if (tab !== 'data_explorer') return
    loadExplorerFilterOptions(explorerFilters).then(setExplorerFilterOptions)
  }, [tab, explorerFilters])

  useEffect(() => {
    if (tab !== 'cost_analysis') return
    const fields = Object.keys(COST_ANALYSIS_DEFAULT_FILTERS) as (keyof GapCatalogFilters)[]
    Promise.all(
      fields.map(async (field) => {
        const opts = await getFilterOptions(field, filterQueryParams(costFilters, field))
        return [field, opts] as const
      }),
    ).then((entries) => {
      setCostFilterOptions((prev) => {
        const next = { ...prev }
        entries.forEach(([field, opts]) => { next[field] = opts })
        return next
      })
    })
  }, [tab, costFilters])

  useEffect(() => {
    if (!strip.length) {
      setResult(null)
      return
    }
    setLoading(true)
    calculateComparison(strip, level, currency, '(All)')
      .then((r) => {
        setResult(r)
        setTab(strip.length >= 2 ? 'gap_overview' : 'systems')
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [strip, level, currency])

  const isSelected = (cb: CostbookRef) => strip.some((s) => cbKey(s) === cbKey(cb))

  const toggleStrip = (cb: CostbookRef) => {
    const key = cbKey(cb)
    setSlots((prev) => {
      const idx = prev.findIndex((s) => s && cbKey(s) === key)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = null
        return next
      }
      const empty = prev.findIndex((s) => s === null)
      if (empty < 0) return prev
      const next = [...prev]
      next[empty] = cb
      return next
    })
  }

  const clearGapFilters = () => {
    setGapFilters(DEFAULT_GAP_FILTERS)
  }

  const runExplain = async () => {
    if (!result) return
    const res = await explainComparison(result, explainQ)
    setExplainA(res.answer)
  }

  const exportReport = async () => {
    if (!strip.length) return
    if (strip.length === 1) {
      saveBlob(await downloadCostbookReport(strip, currency), 'Costbook_Report.xlsx')
    } else {
      saveBlob(await downloadGapReport(strip, level, currency, '(All)'), 'Gap_Comparison_Report.xlsx')
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-[#1F2F69] px-4 py-2 flex flex-wrap items-center gap-3 border-b border-slate-700">
        <h1 className="text-base font-semibold">Costed BOM Comparison</h1>
        <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
          <span className="text-slate-400 whitespace-nowrap">Currency</span>
          <select
            className="text-sm bg-slate-800 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 min-w-[168px] appearance-none bg-[length:12px] bg-[right_10px_center] bg-no-repeat pr-8"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            title="Display currency for all TPC values"
          >
            {currencyChoices.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <button type="button" disabled={!strip.length} onClick={exportReport} className="text-sm bg-emerald-700 px-3 py-1 rounded disabled:opacity-40">
          Export {strip.length >= 2 ? 'Gap' : 'Costbook'} Report
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
          <div className="p-2 border-b border-slate-800 flex gap-1.5">
            <input
              className="flex-1 min-w-0 rounded px-2 py-1 text-slate-900 text-xs"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runCatalogSearch()}
              placeholder="Search costbooks…"
            />
            <button type="button" onClick={runCatalogSearch} className="shrink-0 bg-slate-200 text-slate-900 px-2 py-1 rounded text-xs font-medium hover:bg-white">
              Search
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCatalogOpen((o) => !o)}
            className="px-2 py-1.5 flex items-center justify-between w-full text-left border-b border-slate-800 hover:bg-slate-800/50"
          >
            <span className="text-[10px] uppercase tracking-wide text-slate-400">Costbook Catalog</span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
              {!catalogLoading && !catalogError && <span>{filteredCatalog.length}</span>}
              <span className="text-slate-400">{catalogOpen ? '▴' : '▾'}</span>
            </span>
          </button>

          {catalogOpen && (
            <div className="flex-1 overflow-y-auto px-2 py-1.5 min-h-0">
              {catalogLoading && <p className="text-[10px] text-slate-500 px-1">Loading…</p>}
              {catalogError && <p className="text-[10px] text-red-300 px-1">{catalogError}</p>}
              {!catalogLoading && !catalogError && filteredCatalog.length === 0 && (
                <p className="text-[10px] text-slate-500 px-1">No matches.</p>
              )}
              <ul className="space-y-0.5">
                {filteredCatalog.map((row) => {
                  const selected = isSelected(row)
                  const tpc = (row.total_tpc ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })
                  return (
                    <li key={cbKey(row)}>
                      <button
                        type="button"
                        onClick={() => toggleStrip(row)}
                        title={row.vehicle_code}
                        className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight border ${selected ? 'border-emerald-500 bg-emerald-950/40' : 'border-slate-800 hover:border-slate-600 hover:bg-slate-800/40'}`}
                      >
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="font-medium text-[11px] truncate">{row.milestone} · {row.milestone_date}</span>
                          <span className="text-emerald-400 tabular-nums shrink-0">{tpc}</span>
                        </div>
                        <div className="text-slate-500 truncate">{row.vehicle_code}</div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </aside>

        <main className="flex-1 flex flex-col overflow-hidden">
          {result && (
            <div className="grid grid-cols-4 gap-2 p-3 border-b border-slate-800 text-sm">
              {[['Baseline', result.kpis.baseline_tpc], ['Compare', result.kpis.compare_tpc], ['Gap', result.kpis.gap], ['Currency', result.kpis.display_currency || 'Source']].map(([l, v]) => (
                <div key={String(l)} className="bg-slate-800/60 rounded px-2 py-1">
                  <div className="text-xs text-slate-400">{l}</div>
                  <div className="font-semibold">{typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v}</div>
                </div>
              ))}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3 p-3 border-b border-slate-800">
            {!strip.length && (
              <div className="md:col-span-2 h-48 bg-slate-900 rounded p-2 flex items-center justify-center text-sm text-slate-400">
                No costbooks selected — charts appear after you add at least one.
              </div>
            )}
            {strip.length > 0 && (
              <div className="h-56 bg-slate-900 rounded p-2">
                <div className="text-xs text-slate-400 mb-1">5th split — baseline</div>
                <ResponsiveContainer width="100%" height="92%">
                  <PieChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                    <Pie
                      data={result?.fifth_split ?? []}
                      dataKey="tpc"
                      nameKey="label"
                      outerRadius={62}
                      isAnimationActive={false}
                      label={renderFifthPieLabels}
                      labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                    >
                      {(result?.fifth_split ?? []).map((e, i) => <Cell key={e.label} fill={colorForFifth(e.label, i)} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _n, p) => [`${fmtTpc(v)} (${((p.payload.pct as number) * 100).toFixed(1)}%)`, p.payload.label]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {strip.length > 0 && (
              <div className="h-56 bg-slate-900 rounded p-2">
                <div className="text-xs text-slate-400 mb-1">{strip.length >= 2 ? `${result?.level ?? 'Analysis'} — gap by category` : 'Top systems'}</div>
                {strip.length >= 2 && result?.waterfall_model ? (
                  <ResponsiveContainer width="100%" height="92%">
                    <BarChart
                      data={result.waterfall_model.segments.map((seg) => {
                        const baseline = seg.values[0]
                        const compare = seg.values[seg.values.length - 1]
                        return { label: seg.label, gap: compare - baseline }
                      })}
                      layout="vertical"
                      margin={{ left: 4, right: 48, top: 4, bottom: 4 }}
                    >
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <YAxis type="category" dataKey="label" tick={{ fill: '#94a3b8', fontSize: 9 }} width={72} />
                      <Tooltip formatter={(v: number) => [fmtTpc(v), 'Gap']} />
                      <Bar dataKey="gap" radius={[0, 2, 2, 0]}>
                        {result.waterfall_model.segments.map((seg, i) => {
                          const gap = seg.values[seg.values.length - 1] - seg.values[0]
                          return <Cell key={seg.label} fill={gap > 0 ? '#C0392B' : gap < 0 ? '#1FA187' : '#64748b'} />
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : strip.length >= 2 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">Calculating gap…</div>
                ) : (
                  <ResponsiveContainer width="100%" height="92%">
                    <BarChart data={(result?.systems ?? []).slice(0, 8)} layout="vertical" margin={{ left: 70 }}>
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <YAxis type="category" dataKey="label" tick={{ fill: '#94a3b8', fontSize: 8 }} width={68} />
                      <Tooltip />
                      <Bar dataKey="tpc" fill="#4472C4" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>

          <div className="px-3 pt-2 flex flex-wrap gap-1 border-b border-slate-800">
            {(['gap_overview', 'cost_analysis', 'data_explorer', 'gap', 'gap_bars', 'gap_compare', 'hierarchy_l123', 'hierarchy_5th', 'systems', 'parts', 'full_bom', 'aligned'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-2 py-1 text-xs rounded-t ${tab === t ? 'bg-slate-800' : 'text-slate-400'}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
            {loading && <span className="text-xs text-slate-500 self-center ml-auto">Calculating…</span>}
          </div>

          {GAP_TABS.includes(tab) && (
            <GapFilterBar
              filters={gapFilters}
              filterOptions={filterOptions}
              level={level}
              levelNames={levelNames}
              showLevel={tab !== 'gap_overview'}
              onFiltersChange={setGapFilters}
              onLevelChange={setLevel}
              onClearAll={clearGapFilters}
            />
          )}

          <div className="flex-1 overflow-auto p-3 text-sm">
            {!result && <p className="text-slate-400 text-sm">Select costbooks to view analysis.</p>}
            {GAP_TABS.includes(tab) && strip.length < 2 && (
              <p className="text-slate-400 text-sm">Select at least 2 costbooks from the catalog to compare.</p>
            )}
            {tab === 'gap_overview' && result && strip.length >= 2 && (
              <div className="bg-slate-900 rounded-lg p-4">
                <GapFifthPivot
                  rows={result.hierarchy_l123_by_fifth ?? []}
                  totalGap={result.kpis.gap}
                  baselineLabel={result.costbooks[0]?.vehicle_code ?? 'Baseline'}
                  compareLabel={result.costbooks[result.costbooks.length - 1]?.vehicle_code ?? 'Compare'}
                  baselineTotal={result.kpis.baseline_tpc}
                  compareTotal={result.kpis.compare_tpc}
                />
              </div>
            )}
            {tab === 'cost_analysis' && (
              <CostAnalysisPanel
                currency={currency}
                defaultCostbook={strip[0] ?? null}
                filters={costFilters}
                filterOptions={costFilterOptions}
                onFiltersChange={setCostFilters}
                onClearFilters={() => setCostFilters(COST_ANALYSIS_DEFAULT_FILTERS)}
              />
            )}
            {tab === 'data_explorer' && (
              <div className="bg-slate-900 rounded-lg p-4">
                <DataExplorerPanel
                  currency={currency}
                  filters={explorerFilters}
                  filterOptions={explorerFilterOptions}
                  onFiltersChange={setExplorerFilters}
                  onClearFilters={() => setExplorerFilters(EXPLORER_DEFAULT_FILTERS)}
                />
              </div>
            )}
            {tab === 'gap' && result?.waterfall_model && (
              <div className="bg-slate-900 rounded-lg p-4">
                <WaterfallChart model={result.waterfall_model} />
              </div>
            )}
            {tab === 'gap_bars' && result && strip.length >= 2 && (
              <div className="bg-slate-900 rounded-lg p-4">
                <GapDriversChart
                  rows={result.gap_drivers ?? []}
                  totalGap={result.kpis.gap}
                  level={level}
                />
              </div>
            )}
            {tab === 'gap_compare' && result?.waterfall_model && (
              <div className="bg-slate-900 rounded-lg p-4">
                <GapCompareChart model={result.waterfall_model} />
              </div>
            )}
            {GAP_TABS.includes(tab) && strip.length >= 2 && loading && (
              <p className="text-slate-400 text-sm">Building comparison chart…</p>
            )}
            {tab === 'systems' && result && (
              <table className="w-full">
                <thead><tr className="text-slate-400"><th className="text-left">System</th><th>TPC</th><th>Cum %</th></tr></thead>
                <tbody>
                  {(result.systems ?? []).map((row) => (
                    <tr key={row.label} className="border-b border-slate-800">
                      <td className="py-1">{row.label}</td>
                      <td className="py-1 tabular-nums">{row.tpc.toLocaleString()}</td>
                      <td className="py-1 tabular-nums">{(row.cumulative_pct * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'parts' && result && (
              <table className="w-full">
                <thead><tr className="text-slate-400"><th className="text-left">Part</th><th>TPC</th><th>Cum %</th></tr></thead>
                <tbody>
                  {(result.parts ?? []).map((row) => (
                    <tr key={row.label} className="border-b border-slate-800">
                      <td className="py-1 max-w-lg truncate">{row.label}</td>
                      <td className="py-1 tabular-nums">{row.tpc.toLocaleString()}</td>
                      <td className="py-1 tabular-nums">{(row.cumulative_pct * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'full_bom' && result && (
              <table className="w-full">
                <thead><tr className="text-slate-400"><th>Part #</th><th>Description</th><th>System</th><th>TPC</th><th>Cum %</th></tr></thead>
                <tbody>
                  {(result.full_bom ?? []).slice(0, 200).map((row, i) => (
                    <tr key={i} className={`border-b border-slate-800 ${row.cumulative_pct <= 0.8 ? 'bg-emerald-950/20' : ''}`}>
                      <td className="py-0.5 pr-2">{row.part_number}</td>
                      <td className="py-0.5 pr-2 max-w-xs truncate">{row.part_description}</td>
                      <td className="py-0.5 pr-2">{row.macro_system}</td>
                      <td className="py-0.5 tabular-nums">{row.tpc.toLocaleString()}</td>
                      <td className="py-0.5 tabular-nums">{(row.cumulative_pct * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'aligned' && result && (
              <table className="w-full">
                <thead><tr className="text-slate-400"><th>Part #</th><th>Description</th>{result.totals.map((_, i) => <th key={i}>V{i + 1}</th>)}<th>Gap</th></tr></thead>
                <tbody>
                  {(result.aligned_bom ?? []).slice(0, 200).map((row, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="py-0.5">{String(row['Part Number'] ?? '')}</td>
                      <td className="py-0.5 max-w-xs truncate">{String(row['Part Description'] ?? '')}</td>
                      {row.values.map((v, vi) => <td key={vi} className="py-0.5 tabular-nums">{v.toLocaleString()}</td>)}
                      <td className="py-0.5 tabular-nums">{row.gap.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === 'hierarchy_l123' && result && (
              <div className="bg-slate-900 rounded-lg p-4">
                <HierarchyPivotTable
                  rows={result.hierarchy_l123 ?? []}
                  byFifth={false}
                  compareMode={strip.length >= 2}
                  totalGap={result.kpis.gap}
                />
              </div>
            )}
            {tab === 'hierarchy_5th' && result && (
              <div className="bg-slate-900 rounded-lg p-4">
                <HierarchyPivotTable
                  rows={result.hierarchy_l123_by_fifth ?? []}
                  byFifth
                  compareMode={strip.length >= 2}
                  totalGap={result.kpis.gap}
                />
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 p-3 bg-slate-900/80">
            <div className="text-sm font-medium mb-1">Explain</div>
            <div className="flex gap-2">
              <input className="flex-1 rounded px-2 py-1 text-slate-900 text-sm" value={explainQ} onChange={(e) => setExplainQ(e.target.value)} placeholder="Why did cost increase?" />
              <button type="button" disabled={!result} onClick={runExplain} className="bg-[#1F2F69] border border-slate-600 px-3 py-1 rounded text-sm disabled:opacity-40">Explain</button>
            </div>
            {explainA && <pre className="mt-2 text-xs whitespace-pre-wrap text-slate-300 max-h-32 overflow-auto">{explainA}</pre>}
          </div>
        </main>
      </div>
    </div>
  )
}
