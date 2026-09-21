export type GapCatalogFilters = {
  region: string
  carline_type: string
  platform: string
  powertrain: string
  milestone: string
}

type FilterOptions = {
  region: string[]
  carline_type: string[]
  platform: string[]
  powertrain: string[]
  milestone: string[]
}

type Props = {
  filters: GapCatalogFilters
  filterOptions: FilterOptions
  level: string
  levelNames: string[]
  showLevel?: boolean
  onFiltersChange: (f: GapCatalogFilters) => void
  onLevelChange: (level: string) => void
  onClearAll: () => void
}

const FILTER_FIELDS: { key: keyof GapCatalogFilters; label: string }[] = [
  { key: 'region', label: 'Region' },
  { key: 'carline_type', label: 'Type' },
  { key: 'platform', label: 'Platform' },
  { key: 'powertrain', label: 'Powertrain' },
  { key: 'milestone', label: 'Milestone' },
]

const selectCls = 'bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 text-xs min-w-[100px] max-w-[140px]'

export default function GapFilterBar({
  filters,
  filterOptions,
  level,
  levelNames,
  showLevel = true,
  onFiltersChange,
  onLevelChange,
  onClearAll,
}: Props) {
  const analysisLevels = levelNames.filter((l) =>
    ['5th', 'L1 Macro System', 'L2 System', 'L3 Subsystem', 'Part Name'].includes(l),
  )

  return (
    <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-end gap-x-3 gap-y-2">
      {FILTER_FIELDS.map(({ key, label }) => (
        <label key={key} className="flex flex-col gap-0.5 text-[10px] text-slate-400">
          {label}
          <select
            className={selectCls}
            value={filters[key]}
            onChange={(e) => onFiltersChange({ ...filters, [key]: e.target.value })}
          >
            {(filterOptions[key] ?? ['(All)']).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      ))}

      {showLevel && (
        <label className="flex flex-col gap-0.5 text-[10px] text-slate-400">
          Analysis level
          <select className={selectCls} value={level} onChange={(e) => onLevelChange(e.target.value)}>
            {analysisLevels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      )}

      <button
        type="button"
        onClick={onClearAll}
        className="text-xs text-slate-400 border border-slate-600 rounded px-2 py-1 hover:bg-slate-800 ml-auto"
      >
        Clear filters
      </button>
    </div>
  )
}
