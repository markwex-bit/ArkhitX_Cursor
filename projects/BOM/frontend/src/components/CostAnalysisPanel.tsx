import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { getCatalog, getCostStructure } from '../api'
import type { CostbookRef, CostStructureResult } from '../types'
import GapFilterBar, { type GapCatalogFilters } from './GapFilterBar'

type Props = {
  currency: string
  defaultCostbook?: CostbookRef | null
  filterOptions: Record<keyof GapCatalogFilters, string[]>
  onFiltersChange: (f: GapCatalogFilters) => void
  filters: GapCatalogFilters
  onClearFilters: () => void
}

const DEFAULT_FILTERS: GapCatalogFilters = {
  region: '(All)',
  carline_type: '(All)',
  platform: '(All)',
  powertrain: '(All)',
  milestone: '(All)',
}

const cbKey = (c: CostbookRef) => `${c.vehicle_code}|${c.milestone}|${c.milestone_date}`

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 })

export function costbookOptionLabel(cb: CostbookRef): string {
  const parts = [cb.project, cb.vehicle_code, cb.milestone, cb.milestone_date].filter(Boolean)
  return parts.join(' | ')
}

function filterQueryParams(f: GapCatalogFilters) {
  const p: Record<string, string> = {}
  ;(Object.keys(f) as (keyof GapCatalogFilters)[]).forEach((k) => {
    if (f[k] !== '(All)') p[k] = f[k]
  })
  return p
}

export default function CostAnalysisPanel({
  currency,
  defaultCostbook,
  filterOptions,
  onFiltersChange,
  filters,
  onClearFilters,
}: Props) {
  const [catalog, setCatalog] = useState<CostbookRef[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [structure, setStructure] = useState<CostStructureResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setCatalogLoading(true)
    getCatalog(filterQueryParams(filters), currency)
      .then((items) => setCatalog(items))
      .catch(() => setCatalog([]))
      .finally(() => setCatalogLoading(false))
  }, [filters, currency])

  const selectedCostbook = useMemo(() => {
    if (!catalog.length) return null
    const found = catalog.find((cb) => cbKey(cb) === selectedKey)
    if (found) return found
    if (defaultCostbook) {
      const fromStrip = catalog.find((cb) => cbKey(cb) === cbKey(defaultCostbook))
      if (fromStrip) return fromStrip
    }
    return catalog[0]
  }, [catalog, selectedKey, defaultCostbook])

  useEffect(() => {
    if (selectedCostbook && cbKey(selectedCostbook) !== selectedKey) {
      setSelectedKey(cbKey(selectedCostbook))
    }
  }, [selectedCostbook, selectedKey])

  useEffect(() => {
    if (!selectedCostbook) {
      setStructure(null)
      return
    }
    setLoading(true)
    setError('')
    getCostStructure(selectedCostbook, 'L1 Macro System', currency, '(All)')
      .then(setStructure)
      .catch(() => {
        setStructure(null)
        setError('Could not load cost structure for this costbook.')
      })
      .finally(() => setLoading(false))
  }, [selectedCostbook, currency])

  const chartData = structure?.rows ?? []

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-700 text-xs font-medium text-slate-300">
          Costbook selection
        </div>
        <GapFilterBar
          filters={filters}
          filterOptions={filterOptions}
          level="L1 Macro System"
          levelNames={[]}
          showLevel={false}
          onFiltersChange={onFiltersChange}
          onLevelChange={() => {}}
          onClearAll={onClearFilters}
        />
        <div className="px-3 pb-3">
          <label className="flex flex-col gap-1 text-[10px] text-slate-400">
            Costbook
            <select
              className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-slate-200 text-xs w-full max-w-full"
              value={selectedCostbook ? cbKey(selectedCostbook) : ''}
              onChange={(e) => setSelectedKey(e.target.value)}
              disabled={catalogLoading || !catalog.length}
            >
              {catalogLoading && <option value="">Loading…</option>}
              {!catalogLoading && !catalog.length && <option value="">No costbooks match filters</option>}
              {catalog.map((cb) => (
                <option key={cbKey(cb)} value={cbKey(cb)}>
                  {costbookOptionLabel(cb)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="bg-slate-900 rounded-lg p-4 border border-slate-800">
        <h3 className="text-sm font-medium text-slate-200 text-center mb-1">
          Cost structure — TPC by L1 Macro system
        </h3>
        {selectedCostbook && (
          <p className="text-[10px] text-slate-500 text-center mb-4 truncate" title={costbookOptionLabel(selectedCostbook)}>
            {costbookOptionLabel(selectedCostbook)}
            {structure && (
              <span className="ml-2 text-slate-400">
                · Total {fmt(structure.total_tpc)}
              </span>
            )}
          </p>
        )}

        {loading && <p className="text-slate-400 text-sm text-center py-12">Loading…</p>}
        {error && <p className="text-red-300 text-sm text-center py-12">{error}</p>}
        {!loading && !error && !chartData.length && (
          <p className="text-slate-400 text-sm text-center py-12">Select a costbook to view L1 breakdown.</p>
        )}

        {!loading && !error && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={chartData} margin={{ top: 24, right: 16, left: 8, bottom: 72 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#94a3b8', fontSize: 9 }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={72}
              />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} tickFormatter={(v) => fmt(v)} width={56} />
              <Tooltip
                formatter={(v: number) => [fmt(v), 'TPC']}
                labelFormatter={(label) => String(label)}
                contentStyle={{ background: '#1e293b', border: '1px solid #475569', fontSize: 12 }}
              />
              <Bar dataKey="tpc" fill="#4472C4" radius={[2, 2, 0, 0]} maxBarSize={48}>
                <LabelList
                  dataKey="tpc"
                  position="top"
                  fill="#e2e8f0"
                  fontSize={10}
                  formatter={(v: number) => fmt(v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export { DEFAULT_FILTERS as COST_ANALYSIS_DEFAULT_FILTERS }
