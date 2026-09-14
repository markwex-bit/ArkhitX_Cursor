import { RefreshCw } from 'lucide-react'

export interface ProjectOption {
  id: string
  name: string
}

export function ProjectSelector({
  projects,
  selectedId,
  onSelect,
  onRefresh,
  loading,
}: {
  projects: ProjectOption[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRefresh?: () => void
  loading?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="text-xs border border-ax-border rounded px-2 py-1 bg-ax-bg-3 text-ax-text min-w-[180px] focus:outline-none focus:border-ax-primary"
      >
        {projects.length === 0 && <option value="">No projects</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          className="p-1 hover:bg-ax-bg-3 rounded transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className={cnIcon(loading)} />
        </button>
      )}
    </div>
  )
}

function cnIcon(loading?: boolean) {
  return loading ? 'text-ax-text-muted animate-spin' : 'text-ax-text-muted'
}
