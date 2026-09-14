import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { AuditLogEntry } from '../../types'
import { DataTable } from '../ui/DataTable'
import { JsonCell } from '../ui/JsonCell'
import { ExplanationBanner } from '../ui/ExplanationBanner'
import { StatusBadge } from '../ui/StatusBadge'
import { tokensFromAuditContext } from '../../lib/governanceUtils'

type Filter = 'all' | 'llm' | 'gate' | 'error'

function isError(entry: AuditLogEntry): boolean {
  const result = entry.result || {}
  return Boolean(result.error || result.status === 'error' || result.success === false)
}

function exportCsv(rows: AuditLogEntry[]) {
  const headers = ['time', 'actor', 'action', 'entity_type', 'input_tokens', 'output_tokens', 'context', 'result']
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    headers.join(','),
    ...rows.map((e) => {
      const tokens = tokensFromAuditContext(e.context)
      return [
        e.created_at ?? '',
        e.actor,
        e.action,
        e.entity_type ?? '',
        tokens.input ?? '',
        tokens.output ?? '',
        JSON.stringify(e.context),
        JSON.stringify(e.result),
      ]
        .map((c) => escape(String(c)))
        .join(',')
    }),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function GovernanceAuditLogTab({ entries }: { entries: AuditLogEntry[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [actorFilter, setActorFilter] = useState('')

  const actors = useMemo(() => {
    const set = new Set(entries.map((e) => e.actor))
    return Array.from(set).sort()
  }, [entries])

  const filtered = useMemo(() => {
    let rows = entries
    if (filter === 'llm') rows = rows.filter((e) => e.action.includes('llm') || e.action.includes('agent'))
    if (filter === 'gate') rows = rows.filter((e) => e.action.includes('gate'))
    if (filter === 'error') rows = rows.filter(isError)
    if (actorFilter) rows = rows.filter((e) => e.actor === actorFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(
        (e) =>
          e.actor.toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          JSON.stringify(e.context).toLowerCase().includes(q),
      )
    }
    return rows
  }, [entries, filter, search, actorFilter])

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'llm', label: 'LLM / Agent' },
    { key: 'gate', label: 'Gates' },
    { key: 'error', label: 'Errors' },
  ]

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <ExplanationBanner
        summary="Solution runtime audit trail — governed agent and HITL activity."
        explanation="Shows LLM calls, pipeline steps, and sign-offs from the monitored application only. ArkhitX dashboard scripts, architecture reverse-engineering, and playbook phase gates are excluded."
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                filter === f.key
                  ? 'bg-ax-primary/20 text-ax-primary-light'
                  : 'bg-ax-bg-3 text-ax-text-muted hover:text-ax-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="ax-select text-xs py-1"
        >
          <option value="">All actors</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search actor, action, context…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto px-3 py-1.5 text-xs rounded-md bg-ax-bg-3 border border-ax-border text-ax-text placeholder:text-ax-text-muted w-48"
        />
        <button
          type="button"
          onClick={() => exportCsv(filtered)}
          disabled={filtered.length === 0}
          className="ax-btn-secondary flex items-center gap-1 text-xs"
        >
          <Download size={12} />
          CSV
        </button>
        <span className="text-xs text-ax-text-muted">{filtered.length} records</span>
      </div>

      <DataTable
        rows={filtered}
        emptyMessage="No audit log entries for this project"
        rowKey={(e) => e.id}
        columns={[
          {
            key: 'time',
            header: 'Time',
            className: 'w-36 whitespace-nowrap',
            sortable: true,
            sortValue: (e) => e.created_at ?? '',
            render: (e) => (
              <span className="text-ax-text-muted font-mono">
                {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
              </span>
            ),
          },
          {
            key: 'actor',
            header: 'Actor',
            className: 'w-32',
            sortable: true,
            sortValue: (e) => e.actor,
            render: (e) => <span className="font-medium">{e.actor}</span>,
          },
          {
            key: 'action',
            header: 'Action',
            className: 'w-40',
            sortable: true,
            sortValue: (e) => e.action,
            render: (e) => <StatusBadge status={e.action} />,
          },
          {
            key: 'in',
            header: 'In',
            className: 'w-14 text-right',
            sortable: true,
            sortValue: (e) => tokensFromAuditContext(e.context).input,
            render: (e) => {
              const t = tokensFromAuditContext(e.context).input
              return t != null ? (
                <span className="font-mono text-[10px]">{t.toLocaleString()}</span>
              ) : (
                <span className="text-ax-text-muted">—</span>
              )
            },
          },
          {
            key: 'out',
            header: 'Out',
            className: 'w-14 text-right',
            sortable: true,
            sortValue: (e) => tokensFromAuditContext(e.context).output,
            render: (e) => {
              const t = tokensFromAuditContext(e.context).output
              return t != null ? (
                <span className="font-mono text-[10px]">{t.toLocaleString()}</span>
              ) : (
                <span className="text-ax-text-muted">—</span>
              )
            },
          },
          {
            key: 'context',
            header: 'Context',
            render: (e) => <JsonCell value={e.context} maxLines={2} />,
          },
          {
            key: 'result',
            header: 'Result',
            className: 'w-48',
            render: (e) => (
              <JsonCell value={e.result} maxLines={2} variant={isError(e) ? 'error' : 'default'} />
            ),
          },
        ]}
      />
    </div>
  )
}
