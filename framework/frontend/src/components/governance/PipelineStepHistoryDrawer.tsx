import { X, Clock } from 'lucide-react'
import type { PipelineHistoryRun, PipelineTimelineRow } from '../../types'

function formatConfidence(conf: number | null | undefined): string {
  if (conf == null) return '—'
  const pct = conf <= 1 ? Math.round(conf * 100) : Math.round(conf)
  return `${pct}%`
}

export function PipelineStepHistoryDrawer({
  row,
  onClose,
}: {
  row: PipelineTimelineRow | null
  onClose: () => void
}) {
  if (!row) return null

  const history = row.history ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-lg h-full bg-ax-bg-2 border-l border-ax-border shadow-ax flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ax-border">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Clock size={14} className="text-ax-text-muted" />
              Historical runs
            </h3>
            <p className="text-[10px] text-ax-text-muted font-mono mt-0.5">{row.step_name}</p>
          </div>
          <button type="button" onClick={onClose} className="ax-btn-ghost p-1">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          <div className="ax-panel-pad text-xs">
            <div className="font-medium">{row.step_name}</div>
            <div className="text-ax-text-muted mt-1">
              Current run · {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
              <div>
                <span className="text-ax-text-muted">Tokens</span>
                <div className="font-mono">{row.tokens_total?.toLocaleString() ?? '—'}</div>
              </div>
              <div>
                <span className="text-ax-text-muted">Conf.</span>
                <div className="font-mono">{formatConfidence(row.confidence ?? row.grounding_score)}</div>
              </div>
              <div>
                <span className="text-ax-text-muted">Time</span>
                <div className="font-mono">{row.duration_ms != null ? `${row.duration_ms}ms` : '—'}</div>
              </div>
            </div>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-ax-text-muted text-center py-8">No prior runs for this step.</p>
          ) : (
            history.map((h: PipelineHistoryRun) => (
              <div key={h.id} className="border border-ax-border rounded-lg p-3 text-xs">
                <div className="flex justify-between gap-2 mb-1">
                  <span className="font-mono text-[10px] text-ax-text-muted">
                    {h.created_at ? new Date(h.created_at).toLocaleString() : '—'}
                  </span>
                  <span className="text-[10px] uppercase text-ax-text-muted">{h.status}</span>
                </div>
                <p className="text-ax-text-dim line-clamp-3">{h.output_summary || '—'}</p>
                <div className="flex gap-4 mt-2 text-[10px] font-mono text-ax-text-muted">
                  <span>Tokens: {h.tokens_total?.toLocaleString() ?? '—'}</span>
                  <span>Conf: {formatConfidence(h.confidence)}</span>
                  <span>{h.duration_ms != null ? `${h.duration_ms}ms` : '—'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
