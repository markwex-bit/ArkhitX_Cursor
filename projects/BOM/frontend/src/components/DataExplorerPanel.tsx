import { useEffect, useMemo, useState } from 'react'
import { getCatalog, getFilterOptions, type CatalogFilterField } from '../api'
import type { CostbookRef } from '../types'

export type ExplorerFilters = {
  region: string
  milestone: string
  carline_type: string
  platform: string
  brand: string
  control_owner: string
  projects: string[]
}

export const EXPLORER_DEFAULT_FILTERS: ExplorerFilters = {
  region: '(All)',
  milestone: '(All)',
  carline_type: '(All)',
  platform: '(All)',
  brand: '(All)',
  control_owner: '(All)',
  projects: [],
}

type FilterOptions = Record<CatalogFilterField, string[]>

const SINGLE_FILTER_FIELDS: { key: keyof Omit<ExplorerFilters, 'projects'>; label: string; field: CatalogFilterField }[] = [
  { key: 'region', label: 'Region', field: 'region' },
  { key: 'milestone', label: 'Milestone', field: 'milestone' },
  { key: 'carline_type', label: 'Type', field: 'carline_type' },
  { key: 'platform', label: 'Platform', field: 'platform' },
  { key: 'brand', label: 'Brand Name', field: 'brand' },
  { key: 'control_owner', label: 'Control Owner', field: 'control_owner' },
]

const selectCls = 'bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 text-xs min-w-[100px] max-w-[140px]'

const cbKey = (c: CostbookRef) => `${c.vehicle_code}|${c.milestone}|${c.milestone_date}`

const fmtTpc = (n: number | undefined) =>
  (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

function filtersToParams(f: ExplorerFilters, exclude?: CatalogFilterField): Record<string, string> {
  const p: Record<string, string> = {}
  if (exclude !== 'region' && f.region !== '(All)') p.region = f.region
  if (exclude !== 'milestone' && f.milestone !== '(All)') p.milestone = f.milestone
  if (exclude !== 'carline_type' && f.carline_type !== '(All)') p.carline_type = f.carline_type
  if (exclude !== 'platform' && f.platform !== '(All)') p.platform = f.platform
  if (exclude !== 'brand' && f.brand !== '(All)') p.brand = f.brand
  if (exclude !== 'control_owner' && f.control_owner !== '(All)') p.control_owner = f.control_owner
  if (exclude !== 'project' && f.projects.length > 0) p.project = f.projects.join('|')
  return p
}

function exportCsv(rows: CostbookRef[]) {
  const headers = [
    'Region', 'Project Code', 'Callback Name', 'Milestone', 'Milestone Date',
    'Phase', 'Currency', 'TBC', 'BCP Team', 'Reference Person',
  ]
  const lines = rows.map((r) => [
    r.region ?? '',
    r.project ?? '',
    r.vehicle_code,
    r.milestone,
    r.milestone_date,
    r.phase ?? '',
    r.base_currency ?? '',
    String(r.total_tpc ?? 0),
    r.pcp_team ?? '',
    r.ref_person ?? '',
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'costbook_records.csv'
  a.click()
  URL.revokeObjectURL(url)
}

type Props = {
  currency: string
  filters: ExplorerFilters
  filterOptions: FilterOptions
  onFiltersChange: (f: ExplorerFilters) => void
  onClearFilters: () => void
}

const currencyLabel = (c: string) => (c === '(Source currency)' ? 'Source' : c)

export default function DataExplorerPanel({ currency, filters, filterOptions, onFiltersChange, onClearFilters }: Props) {
  const [records, setRecords] = useState<CostbookRef[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedKey, setSelectedKey] = useState('')
  const [projectsOpen, setProjectsOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    getCatalog(filtersToParams(filters), currency)
      .then(setRecords)
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }, [filters, currency])

  const projectChoices = useMemo(
    () => (filterOptions.project ?? []).filter((v) => v !== '(All)'),
    [filterOptions.project],
  )

  const toggleProject = (code: string) => {
    const next = filters.projects.includes(code)
      ? filters.projects.filter((p) => p !== code)
      : [...filters.projects, code]
    onFiltersChange({ ...filters, projects: next })
  }

  const projectLabel = filters.projects.length === 0
    ? '(All)'
    : `${filters.projects.length} selected`

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Data Explorer — Browse the costbook records</h2>
        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
          One row per project/milestone. Filter with the dropdowns above, then export or select a row for reference.
        </p>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 flex flex-wrap items-end gap-x-3 gap-y-2">
        {SINGLE_FILTER_FIELDS.map(({ key, label, field }) => (
          <label key={key} className="flex flex-col gap-0.5 text-[10px] text-slate-400">
            {label}
            <select
              className={selectCls}
              value={filters[key]}
              onChange={(e) => onFiltersChange({ ...filters, [key]: e.target.value })}
            >
              {(filterOptions[field] ?? ['(All)']).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}

        <div className="relative flex flex-col gap-0.5 text-[10px] text-slate-400">
          Projects
          <button
            type="button"
            className={`${selectCls} text-left flex justify-between items-center gap-2 min-w-[120px]`}
            onClick={() => setProjectsOpen((o) => !o)}
          >
            <span className="truncate">{projectLabel}</span>
            <span className="text-slate-500 shrink-0">{projectsOpen ? '▴' : '▾'}</span>
          </button>
          {projectsOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 w-48 max-h-52 overflow-y-auto rounded border border-slate-600 bg-slate-800 shadow-lg p-1">
              <button
                type="button"
                className="w-full text-left px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 rounded"
                onClick={() => onFiltersChange({ ...filters, projects: [] })}
              >
                (All)
              </button>
              {projectChoices.map((code) => (
                <label key={code} className="flex items-center gap-2 px-2 py-1 text-xs text-slate-300 hover:bg-slate-700 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.projects.includes(code)}
                    onChange={() => toggleProject(code)}
                    className="rounded border-slate-500"
                  />
                  {code}
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClearFilters}
          className="text-xs text-slate-400 border border-slate-600 rounded px-2 py-1 hover:bg-slate-800 ml-auto"
        >
          Clear filters
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">
          Costbook records ({loading ? '…' : records.length})
        </span>
        <button
          type="button"
          disabled={!records.length}
          onClick={() => exportCsv(records)}
          className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-3 py-1 rounded"
        >
          Export table to file
        </button>
      </div>

      <div className="overflow-auto rounded-lg border border-slate-700 max-h-[min(70vh,780px)]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-800">
            <tr className="text-slate-300 border-b border-slate-600">
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">Region</th>
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">Project Code</th>
              <th className="text-left py-2 px-2 font-medium min-w-[200px]">Callback Name</th>
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">Milestone</th>
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">Milestone Date</th>
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">Phase</th>
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">Currency</th>
              <th className="text-right py-2 px-2 font-medium whitespace-nowrap" title={`Displayed in ${currencyLabel(currency)}`}>
                TBC ({currencyLabel(currency)})
              </th>
              <th className="text-left py-2 px-2 font-medium whitespace-nowrap">BCP Team</th>
              <th className="text-left py-2 px-2 font-medium min-w-[160px]">Reference Person</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="py-8 text-center text-slate-400">Loading records…</td></tr>
            )}
            {!loading && !records.length && (
              <tr><td colSpan={10} className="py-8 text-center text-slate-400">No records match the current filters.</td></tr>
            )}
            {!loading && records.map((row) => {
              const key = cbKey(row)
              const selected = key === selectedKey
              return (
                <tr
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`border-b border-slate-800/80 cursor-pointer ${selected ? 'bg-sky-900/50' : 'hover:bg-slate-800/40'}`}
                >
                  <td className="py-1.5 px-2 text-slate-300">{row.region || '—'}</td>
                  <td className="py-1.5 px-2 text-slate-200 font-medium">{row.project || '—'}</td>
                  <td className="py-1.5 px-2 text-slate-300 max-w-md truncate" title={row.vehicle_code}>{row.vehicle_code}</td>
                  <td className="py-1.5 px-2 text-slate-300">{row.milestone}</td>
                  <td className="py-1.5 px-2 text-slate-300 whitespace-nowrap">{row.milestone_date}</td>
                  <td className="py-1.5 px-2 text-slate-300">{row.phase || '—'}</td>
                  <td className="py-1.5 px-2 text-slate-300">{row.base_currency || '—'}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-slate-200">{fmtTpc(row.total_tpc)}</td>
                  <td className="py-1.5 px-2 text-slate-300">{row.pcp_team || '—'}</td>
                  <td className="py-1.5 px-2 text-slate-400 max-w-xs truncate" title={row.ref_person}>{row.ref_person || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export async function loadExplorerFilterOptions(filters: ExplorerFilters): Promise<FilterOptions> {
  const fields: CatalogFilterField[] = [
    'region', 'milestone', 'carline_type', 'platform', 'brand', 'control_owner', 'project',
  ]
  const entries = await Promise.all(
    fields.map(async (field) => {
      const opts = await getFilterOptions(field, filtersToParams(filters, field))
      return [field, opts] as const
    }),
  )
  return Object.fromEntries(entries) as FilterOptions
}
