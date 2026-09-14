import type { QlikQualificationResult, QlikQualificationSummary } from '../types'
import Badge from './Badge'
import { DataTable } from './ui/DataTable'

const REASON_LABELS: Record<string, string> = {
  below_completeness_threshold: 'Below completeness threshold',
  no_data_connection_identified: 'No data connection identified',
  no_master_items_captured: 'No measures/dimensions captured',
  stale_reload: 'Stale reload (180+ days)',
}

export default function QlikQualificationReport({ summary }: { summary: QlikQualificationSummary }) {
  const qualified = summary.results.filter((r) => r.qualified)
  const excluded = summary.results.filter((r) => !r.qualified)

  return (
    <div className="space-y-3">
      <div className="ax-panel overflow-hidden">
        <div className="ax-panel-toolbar">
          <span className="ax-panel-toolbar-title">Phase 3 — Qlik qualification</span>
          <div className="ax-panel-toolbar-meta">
            <span>
              <strong className="text-ax-text">{summary.total}</strong> scanned
            </span>
            <span>
              <strong className="text-ax-green">{summary.qualified_count}</strong> qualified (
              {summary.qualified_pct}%)
            </span>
            <span>
              <strong className="text-ax-red">{summary.excluded_count}</strong> excluded (
              {summary.excluded_pct}%)
            </span>
            <span className="text-ax-text-muted">
              threshold ≥ {summary.completeness_threshold}
            </span>
          </div>
        </div>
        {Object.keys(summary.by_reason).length > 0 && (
          <div className="ax-panel-body space-y-2">
            <p className="text-[10px] text-ax-text-muted">Exclusion reasons — aggregate counts.</p>
            {Object.entries(summary.by_reason)
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <div key={reason} className="flex items-center gap-2">
                  <div className="w-52 text-[11px] text-ax-text-dim truncate">
                    {REASON_LABELS[reason] ?? reason}
                  </div>
                  <div className="flex-1 bg-ax-bg-3 rounded h-1.5 overflow-hidden">
                    <div
                      className="bg-ax-red h-1.5 opacity-80"
                      style={{ width: `${Math.min(100, (count / summary.total) * 100)}%` }}
                    />
                  </div>
                  <div className="w-6 text-[11px] text-right tabular-nums">{count}</div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="ax-panel overflow-hidden">
          <div className="ax-panel-header">Qualified ({qualified.length})</div>
          <div className="p-2">
            <DataTable
              rows={qualified}
              rowKey={(r) => r.app_id}
              columns={qualifiedColumns}
              emptyMessage="No qualified Qlik apps"
            />
          </div>
        </div>
        <div className="ax-panel overflow-hidden">
          <div className="ax-panel-header">Excluded ({excluded.length})</div>
          <div className="p-2">
            <DataTable
              rows={excluded}
              rowKey={(r) => r.app_id}
              columns={excludedColumns}
              emptyMessage="No excluded Qlik apps"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

const qualifiedColumns = [
  {
    key: 'name',
    header: 'App',
    render: (r: QlikQualificationResult) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: 'score',
    header: 'Score',
    render: (r: QlikQualificationResult) => (
      <span className="font-mono tabular-nums">{r.completeness_score.toFixed(2)}</span>
    ),
  },
  {
    key: 'flags',
    header: 'Flags',
    render: (r: QlikQualificationResult) =>
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
    header: 'App',
    render: (r: QlikQualificationResult) => <span className="font-medium">{r.name}</span>,
  },
  {
    key: 'score',
    header: 'Score',
    render: (r: QlikQualificationResult) => (
      <span className="font-mono tabular-nums">{r.completeness_score.toFixed(2)}</span>
    ),
  },
  {
    key: 'reasons',
    header: 'Reasons',
    render: (r: QlikQualificationResult) => (
      <div className="flex flex-wrap gap-0.5">
        {r.exclusion_reasons.map((reason) => (
          <Badge key={reason} tone="Low">
            {REASON_LABELS[reason]?.split(' (')[0] ?? reason}
          </Badge>
        ))}
      </div>
    ),
  },
]
