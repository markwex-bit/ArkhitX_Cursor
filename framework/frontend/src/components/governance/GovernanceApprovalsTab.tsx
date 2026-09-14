import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { GateDecisionRecord, Project } from '../../types'
import { DataTable } from '../ui/DataTable'
import { ExplanationBanner } from '../ui/ExplanationBanner'
import { StatusBadge } from '../ui/StatusBadge'
import { JsonCell } from '../ui/JsonCell'
import { PendingGatesPanel } from './PendingGatesPanel'

export function GovernanceApprovalsTab({
  project,
  decisions,
}: {
  project: Project | null
  decisions: GateDecisionRecord[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      <ExplanationBanner
        summary="Solution HITL gate decisions from the monitored application."
        explanation="Shows sign-off and approval gates logged by the application itself (e.g. migration sign-off). ArkhitX playbook phase gates are excluded — Governance tracks solution runtime, not dashboard setup."
      />

      <PendingGatesPanel project={project} gateHistory={decisions} />

      <h3 className="ax-section-title">Decision history</h3>
      <DataTable
        rows={decisions}
        emptyMessage="No gate decisions recorded yet"
        rowKey={(d) => d.id}
        columns={[
          {
            key: 'expand',
            header: '',
            className: 'w-8',
            render: (d) => (
              <button
                type="button"
                onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                className="ax-btn-ghost p-0.5"
              >
                {expandedId === d.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ),
          },
          {
            key: 'time',
            header: 'Time',
            className: 'w-36 whitespace-nowrap',
            sortable: true,
            sortValue: (d) => d.created_at ?? '',
            render: (d) => (
              <span className="text-ax-text-muted font-mono">
                {d.created_at ? new Date(d.created_at).toLocaleString() : '—'}
              </span>
            ),
          },
          {
            key: 'gate',
            header: 'Gate',
            sortable: true,
            sortValue: (d) => d.gate_name,
            render: (d) => (
              <div>
                <div className="font-medium">{d.gate_name}</div>
                {d.phase != null && <div className="text-ax-text-muted text-[10px]">Phase {d.phase}</div>}
              </div>
            ),
          },
          {
            key: 'decision',
            header: 'Decision',
            className: 'w-28',
            sortable: true,
            sortValue: (d) => d.decision,
            render: (d) => <StatusBadge status={d.decision} />,
          },
          {
            key: 'reviewer',
            header: 'Reviewer',
            className: 'w-32',
            render: (d) => d.reviewer || '—',
          },
          {
            key: 'notes',
            header: 'Notes',
            render: (d) => (
              <span className="text-ax-text-dim line-clamp-2">{d.notes || '—'}</span>
            ),
          },
        ]}
      />

      {expandedId && (
        <div className="ax-panel-pad space-y-3">
          {(() => {
            const d = decisions.find((x) => x.id === expandedId)
            if (!d || !project) return null
            return (
              <>
                <div className="flex items-center justify-between">
                  <span className="ax-section-title">{d.gate_name} — full record</span>
                  <Link to={`/projects/${project.id}`} className="ax-link flex items-center gap-1 text-xs">
                    Open workspace <ExternalLink size={12} />
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-ax-text-muted uppercase mb-1">Items reviewed</div>
                    <JsonCell value={d.items_reviewed} />
                  </div>
                  <div>
                    <div className="text-[10px] text-ax-text-muted uppercase mb-1">Conditions</div>
                    <JsonCell value={d.conditions} />
                  </div>
                </div>
                {d.notes && (
                  <div>
                    <div className="text-[10px] text-ax-text-muted uppercase mb-1">Notes</div>
                    <p className="text-xs text-ax-text-dim whitespace-pre-wrap">{d.notes}</p>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
