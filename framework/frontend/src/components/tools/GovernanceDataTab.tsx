import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Lock, Database, AlertTriangle, Save } from 'lucide-react'
import { adminDataApi, projectsApi } from '../../lib/api'
import { DataTable } from '../ui/DataTable'
import { ExplanationBanner } from '../ui/ExplanationBanner'
import { JsonCell } from '../ui/JsonCell'
import { ProjectSelector } from '../ui/ProjectSelector'

interface TableMeta {
  table_name: string
  row_count: number
  editable: boolean
  group: string
}

const IMMUTABLE_TABLES = new Set(['audit_logs', 'gate_decisions', 'grounding_records', 'llm_usage_logs', 'pipeline_events'])

export function GovernanceDataTab() {
  const [tables, setTables] = useState<TableMeta[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [editable, setEditable] = useState(false)
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [editCell, setEditCell] = useState<{ rowId: string; key: string; value: string } | null>(null)
  const limit = 50

  const tableMeta = tables.find((t) => t.table_name === selectedTable)

  const loadTables = useCallback(async () => {
    const { data } = await adminDataApi.listTables()
    setTables(data as TableMeta[])
  }, [])

  const loadRows = useCallback(async () => {
    if (!selectedTable) return
    setLoading(true)
    try {
      const { data } = await adminDataApi.getRows(selectedTable, {
        project_id: projectId || undefined,
        limit,
        offset,
      })
      const payload = data as {
        rows: Record<string, unknown>[]
        total_count: number
        editable: boolean
      }
      setRows(payload.rows)
      setTotalCount(payload.total_count)
      setEditable(payload.editable)
    } finally {
      setLoading(false)
    }
  }, [selectedTable, projectId, offset])

  useEffect(() => {
    void loadTables()
    void projectsApi.list().then((res) => {
      const list = res.data as { id: string; name: string }[]
      setProjects(list)
      if (list.length > 0 && !projectId) setProjectId(list[0].id)
    })
  }, [loadTables, projectId])

  useEffect(() => {
    setOffset(0)
  }, [selectedTable, projectId])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const pkForRow = (row: Record<string, unknown>) => String(row.id ?? row.uuid ?? '')

  const saveEdit = async () => {
    if (!editCell || !selectedTable || !editable) return
    let parsed: unknown = editCell.value
    try {
      parsed = JSON.parse(editCell.value)
    } catch {
      parsed = editCell.value
    }
    await adminDataApi.updateRow(selectedTable, editCell.rowId, { [editCell.key]: parsed })
    setEditCell(null)
    void loadRows()
  }

  const columns =
    rows.length > 0
      ? Object.keys(rows[0]).slice(0, 8).map((key) => ({
          key,
          header: key,
          sortable: true,
          sortValue: (row: Record<string, unknown>) => {
            const val = row[key]
            if (val == null) return null
            if (typeof val === 'number') return val
            if (typeof val === 'string') return val
            return JSON.stringify(val)
          },
          render: (row: Record<string, unknown>) => {
            const val = row[key]
            const rowId = pkForRow(row)
            const isEditing = editCell?.rowId === rowId && editCell.key === key

            if (isEditing) {
              return (
                <div className="flex gap-1 items-start">
                  <textarea
                    className="ax-textarea text-[10px] min-h-[40px] flex-1"
                    value={editCell.value}
                    onChange={(e) => setEditCell({ ...editCell, value: e.target.value })}
                  />
                  <button type="button" onClick={() => void saveEdit()} className="ax-btn-primary p-1">
                    <Save size={10} />
                  </button>
                </div>
              )
            }

            if (val !== null && typeof val === 'object') {
              return <JsonCell value={val} maxLines={1} />
            }

            const text = val == null ? '—' : String(val)
            return (
              <span
                className={`font-mono text-[10px] truncate block max-w-[180px] ${
                  editable && !IMMUTABLE_TABLES.has(selectedTable ?? '') ? 'cursor-pointer hover:text-ax-primary-light' : ''
                }`}
                title={editable ? 'Click to edit' : undefined}
                onClick={() => {
                  if (!editable || IMMUTABLE_TABLES.has(selectedTable ?? '')) return
                  setEditCell({ rowId, key, value: text })
                }}
              >
                {text}
              </span>
            )
          },
        }))
      : []

  const grouped = tables.reduce<Record<string, TableMeta[]>>((acc, t) => {
    ;(acc[t.group] ||= []).push(t)
    return acc
  }, {})

  const pageCount = Math.ceil(totalCount / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <ExplanationBanner
        summary="Scoped governance database — whitelist tables only."
        explanation="Browse and edit governance-related PostgreSQL tables. Audit logs, gate decisions, and grounding records are immutable. Filter by project where applicable."
      />

      {selectedTable && IMMUTABLE_TABLES.has(selectedTable) && (
        <div className="flex items-center gap-2 ax-alert-err py-2">
          <AlertTriangle size={14} />
          <span>{selectedTable} is read-only — audit trail integrity is enforced.</span>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="w-56 shrink-0 flex flex-col border border-ax-border rounded-lg bg-ax-bg-2 overflow-hidden">
          <div className="px-3 py-2 border-b border-ax-border text-xs font-semibold text-ax-text-muted flex items-center gap-2">
            <Database size={12} />
            Tables
          </div>
          <div className="overflow-auto flex-1 p-2 space-y-3">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="text-[9px] uppercase tracking-wider text-ax-text-muted px-1 mb-1">{group}</div>
                {items.map((t) => (
                  <button
                    key={t.table_name}
                    type="button"
                    onClick={() => setSelectedTable(t.table_name)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 mb-0.5 ${
                      selectedTable === t.table_name
                        ? 'bg-ax-primary/20 text-ax-primary-light'
                        : 'hover:bg-ax-bg-3 text-ax-text-dim'
                    }`}
                  >
                    {!t.editable && <Lock size={10} className="shrink-0 opacity-50" />}
                    <span className="truncate font-mono">{t.table_name}</span>
                    <span className="ml-auto text-ax-text-muted text-[10px]">
                      {t.row_count >= 0 ? t.row_count : '?'}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <ProjectSelector projects={projects} selectedId={projectId} onSelect={setProjectId} />
            <button
              type="button"
              onClick={() => void loadRows()}
              disabled={loading || !selectedTable}
              className="ax-btn-secondary"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            {selectedTable && (
              <>
                <span className="text-xs text-ax-text-muted ml-auto">
                  {selectedTable} · {totalCount} rows
                  {tableMeta && !tableMeta.editable && ' · read-only'}
                </span>
                {pageCount > 1 && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={offset === 0}
                      className="ax-btn-ghost px-2"
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                    >
                      Prev
                    </button>
                    <span className="text-[10px] text-ax-text-muted self-center">
                      {currentPage}/{pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={offset + limit >= totalCount}
                      className="ax-btn-ghost px-2"
                      onClick={() => setOffset(offset + limit)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {!selectedTable ? (
            <div className="flex-1 flex items-center justify-center text-sm text-ax-text-muted border border-ax-border rounded-lg bg-ax-bg-2">
              Select a table to browse rows
            </div>
          ) : (
            <DataTable rows={rows} columns={columns} emptyMessage={loading ? 'Loading…' : 'No rows'} />
          )}
        </div>
      </div>
    </div>
  )
}
