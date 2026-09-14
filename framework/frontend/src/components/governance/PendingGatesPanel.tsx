import type { GateDecisionRecord } from '../../types'
import { StatusBadge } from '../ui/StatusBadge'

/** Solution HITL gates logged by the monitored application (not ArkhitX playbook gates). */
const SOLUTION_GATE_NAMES = ['migration_signoff']

export function PendingGatesPanel({
  gateHistory,
}: {
  project: { id: string; name?: string } | null
  gateHistory: GateDecisionRecord[]
}) {
  const approvedGates = new Set(
    gateHistory.filter((g) => g.decision === 'approved' || g.decision === 'confirmed').map((g) => g.gate_name),
  )

  const pending = SOLUTION_GATE_NAMES.filter((gateName) => !approvedGates.has(gateName))

  if (pending.length === 0) {
    return (
      <div className="ax-alert-info">
        No pending solution HITL gates. Sign-off decisions appear here when reviewers act in the
        monitored application (e.g. migration sign-off on a Qlik disposition).
      </div>
    )
  }

  return (
    <div className="ax-panel overflow-hidden">
      <div className="ax-panel-header flex items-center justify-between">
        <span>Pending solution approval</span>
      </div>
      <div className="p-3 space-y-2">
        {pending.map((gateName) => (
          <div
            key={gateName}
            className="flex items-center justify-between px-2 py-1.5 rounded bg-ax-gate-bg border border-ax-gate-border"
          >
            <div>
              <div className="text-xs font-medium text-ax-gate-text">{gateName}</div>
              <div className="text-[10px] text-ax-text-muted">Recorded from application runtime</div>
            </div>
            <StatusBadge status="pending" />
          </div>
        ))}
      </div>
    </div>
  )
}
