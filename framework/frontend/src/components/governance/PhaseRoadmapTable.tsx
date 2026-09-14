import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PHASE_NAMES, PHASE_ORDER, GATE_NAMES } from '../../types'
import type { AuditLogEntry } from '../../types'
import { cn } from '../../lib/utils'
import { StatusBadge } from '../ui/StatusBadge'

interface PipelineEvent {
  id: string
  phase: number | null
  step_name: string
  status: string
  created_at: string | null
}

export function PhaseRoadmapTable({
  currentPhase,
  auditLog,
  pipelineEvents,
}: {
  currentPhase: number
  auditLog: AuditLogEntry[]
  pipelineEvents: PipelineEvent[]
}) {
  const [expanded, setExpanded] = useState<number | null>(currentPhase)

  return (
    <div className="ax-panel overflow-hidden">
      <div className="ax-panel-header">Playbook Phases (A → 5)</div>
      <div className="divide-y divide-ax-border/40">
        {PHASE_ORDER.map((phaseNum) => {
          const isComplete = phaseNum < currentPhase
          const isCurrent = phaseNum === currentPhase
          const isOpen = expanded === phaseNum
          const gate = GATE_NAMES[phaseNum]
          const phaseAudits = auditLog.filter((e) => {
            const ctx = e.context || {}
            return ctx.phase === phaseNum || e.action.includes(`phase_${phaseNum}`)
          }).slice(0, 5)
          const phaseEvents = pipelineEvents
            .filter((ev) => ev.phase === phaseNum)
            .slice(0, 5)

          return (
            <div key={phaseNum}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : phaseNum)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-ax-bg-3/50 transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="w-3 h-3 text-ax-text-muted shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-ax-text-muted shrink-0" />
                )}
                <span className="text-[10px] font-mono text-ax-text-muted w-6">
                  {phaseNum === -1 ? 'A' : phaseNum}
                </span>
                <span className="text-xs font-medium flex-1 truncate">
                  {PHASE_NAMES[phaseNum]}
                </span>
                {gate && (
                  <span className="text-[10px] font-mono text-ax-text-muted hidden sm:inline">
                    {gate}
                  </span>
                )}
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded',
                    isComplete && 'ax-phase-done',
                    isCurrent && !isComplete && 'ax-phase-current',
                    !isComplete && !isCurrent && 'ax-phase-pending',
                  )}
                >
                  {isComplete ? 'complete' : isCurrent ? 'current' : 'pending'}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-0 ml-6 space-y-2">
                  {phaseEvents.length > 0 && (
                    <div>
                      <div className="ax-section-title mb-1">Pipeline events</div>
                      {phaseEvents.map((ev) => (
                        <div key={ev.id} className="text-[10px] text-ax-text-muted flex gap-2">
                          <StatusBadge status={ev.status} />
                          <span>{ev.step_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {phaseAudits.length > 0 && (
                    <div>
                      <div className="ax-section-title mb-1">Recent audit</div>
                      {phaseAudits.map((a) => (
                        <div key={a.id} className="text-[10px] text-ax-text-muted flex gap-2">
                          <span className="font-mono">{a.actor}</span>
                          <span>{a.action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {phaseEvents.length === 0 && phaseAudits.length === 0 && (
                    <p className="text-[10px] text-ax-text-muted">No activity recorded for this phase yet.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
