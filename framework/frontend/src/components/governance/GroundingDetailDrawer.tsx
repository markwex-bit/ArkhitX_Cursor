import { X } from 'lucide-react'
import { GroundingRecord, Project } from '../../types'
import { isGraphGroundingAgent } from '../../lib/governanceUtils'
import { ScoreBadge } from '../ui/ScoreBadge'
import { JsonCell } from '../ui/JsonCell'

export function GroundingDetailDrawer({
  record,
  project,
  onClose,
}: {
  record: GroundingRecord | null
  project: Project | null
  onClose: () => void
}) {
  if (!record) return null

  const isNonGraph = !isGraphGroundingAgent(project, record.agent_name)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md h-full bg-ax-bg-2 border-l border-ax-border shadow-ax flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-ax-border">
          <div>
            <h3 className="text-sm font-bold">Grounding Detail</h3>
            <p className="text-[10px] text-ax-text-muted font-mono">{record.agent_name}</p>
          </div>
          <button type="button" onClick={onClose} className="ax-btn-ghost p-1">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="ax-panel-pad">
              <div className="text-[10px] text-ax-text-muted uppercase">Score</div>
              {record.grounding_score == null || isNonGraph ? (
                <span className="text-ax-amber text-sm font-medium">N/A by design</span>
              ) : (
                <ScoreBadge score={record.grounding_score} />
              )}
            </div>
            <div className="ax-panel-pad">
              <div className="text-[10px] text-ax-text-muted uppercase">Nodes cited</div>
              <div className="text-lg font-bold">{record.node_count}</div>
            </div>
          </div>
          <div>
            <div className="ax-section-title mb-1">Query path</div>
            <p className="font-mono text-ax-text-dim break-all">{record.query_path || '—'}</p>
          </div>
          <div>
            <div className="ax-section-title mb-1">Response summary</div>
            <p className="text-ax-text-dim leading-relaxed whitespace-pre-wrap">
              {(record as GroundingRecord & { response_summary?: string }).response_summary ||
                '—'}
            </p>
          </div>
          <div>
            <div className="ax-section-title mb-1">Cited nodes</div>
            <JsonCell value={record.cited_nodes} />
          </div>
          <div className="text-[10px] text-ax-text-muted">
            {record.created_at ? new Date(record.created_at).toLocaleString() : ''}
          </div>
        </div>
      </div>
    </div>
  )
}
