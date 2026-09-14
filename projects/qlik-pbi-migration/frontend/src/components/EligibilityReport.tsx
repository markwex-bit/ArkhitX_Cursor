import type { EligibilitySummary, EligibilityResult } from '../types'
import Badge from './Badge'
import { DataTable } from './ui/DataTable'

const REASON_LABELS: Record<string, string> = {
  personal_workspace: 'Personal workspace',
  test_or_sandbox_name: 'Test / sandbox / copy naming',
  stale: 'Abandoned / stale (180+ days)',
  orphaned_dataset: 'Orphaned dataset',
  broken_lineage: 'Broken lineage',
  duplicate: 'Duplicate copy',
}

export default function EligibilityReport({ summary }: { summary: EligibilitySummary }) {
  const excluded = summary.results.filter((r) => !r.eligible)
  const eligible = summary.results.filter((r) => r.eligible)

  return (
    <div className="space-y-3 flex flex-col min-h-0">
      <div className="ax-panel overflow-hidden flex flex-col min-h-0">
        <div className="ax-panel-toolbar">
          <span className="ax-panel-toolbar-title">Phase 2 — Power BI qualification</span>
          <div className="ax-panel-toolbar-meta">
            <span>
              <strong className="text-ax-text">{summary.total}</strong> scanned
            </span>
            <span>
              <strong className="text-ax-green">{summary.eligible_count}</strong> eligible (
              {summary.eligible_pct}%)
            </span>
            <span>
              <strong className="text-ax-red">{summary.excluded_count}</strong> excluded (
              {summary.excluded_pct}%)
            </span>
          </div>
        </div>

        <div className="ax-panel-body space-y-2">
          <p className="text-[10px] text-ax-text-muted leading-relaxed">
            Exclusion reasons — aggregate counts from deterministic rules (no LLM).
          </p>
          {Object.entries(summary.by_reason)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-2">
                <div className="w-44 text-[11px] text-ax-text-dim flex-shrink-0 truncate" title={REASON_LABELS[reason] ?? reason}>
                  {REASON_LABELS[reason] ?? reason}
                </div>
                <div className="flex-1 bg-ax-bg-3 rounded h-1.5 overflow-hidden">
                  <div
                    className="bg-ax-red h-1.5 opacity-80"
                    style={{ width: `${Math.min(100, (count / summary.total) * 100)}%` }}
                  />
                </div>
                <div className="w-6 text-[11px] text-ax-text-dim text-right tabular-nums">{count}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0 flex-1">
        <div className="ax-panel overflow-hidden flex flex-col min-h-0">
          <div className="ax-panel-header">Clean pool ({eligible.length})</div>
          <div className="p-2 min-h-0 flex-1">
            <DataTable
              rows={eligible}
              rowKey={(r) => r.dataset_id}
              columns={eligibleColumns}
              emptyMessage="No eligible datasets"
            />
          </div>
        </div>

        <div className="ax-panel overflow-hidden flex flex-col min-h-0">
          <div className="ax-panel-header">Excluded ({excluded.length})</div>
          <div className="p-2 min-h-0 flex-1">
            <DataTable
              rows={excluded}
              rowKey={(r) => r.dataset_id}
              columns={excludedColumns}
              emptyMessage="No excluded datasets"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const eligibleColumns = [
  {
    key: 'name',
    header: 'Name',
    render: (r: EligibilityResult) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: 'workspace',
    header: 'Workspace',
    render: (r: EligibilityResult) => <span className="text-ax-text-dim">{r.workspace_name}</span>,
  },
  {
    key: 'flags',
    header: 'Flags',
    render: (r: EligibilityResult) =>
      r.quality_flags.length === 0 ? (
        <span className="text-ax-text-muted">—</span>
      ) : (
        <div className="flex flex-wrap gap-0.5">
          {r.quality_flags.map((f) => (
            <Badge key={f} tone="Medium">
              {f.replace(/_/g, ' ')}
            </Badge>
          ))}
        </div>
      ),
  },
]

const excludedColumns = [
  {
    key: 'name',
    header: 'Name',
    render: (r: EligibilityResult) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: 'workspace',
    header: 'Workspace',
    render: (r: EligibilityResult) => <span className="text-ax-text-dim">{r.workspace_name}</span>,
  },
  {
    key: 'reasons',
    header: 'Reasons',
    render: (r: EligibilityResult) => (
      <div className="flex flex-wrap gap-0.5">
        {r.exclusion_reasons.map((reason) => (
          <Badge key={reason} tone="Low">
            {reason.startsWith('duplicate_of:')
              ? 'duplicate'
              : REASON_LABELS[reason]?.split(' (')[0] ?? reason}
          </Badge>
        ))}
      </div>
    ),
  },
]
