import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { useProjectStore } from '../lib/stores/projectStore'
import { PHASE_NAMES, PHASE_ORDER, GATE_NAMES, PHASE_DOC_FILES } from '../types'
import PainPointForm from '../components/PainPointForm'
import SignalReview from '../components/SignalReview'
import HITLGateOverlay from '../components/HITLGateOverlay'
import ArchitectureWorkspace from '../components/architecture/ArchitectureWorkspace'
import { RetrievalStrategyPanel } from '../components/project/RetrievalStrategyPanel'
import { CheckCircle, Circle, ArrowRight } from 'lucide-react'

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>()
  const { currentProject, setCurrentProject } = useProjectStore()
  const [showGate, setShowGate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [archNotStarted, setArchNotStarted] = useState(0)
  const [archReady, setArchReady] = useState(false)

  useEffect(() => {
    if (id) {
      projectsApi.get(id).then(({ data }) => {
        setCurrentProject(data)
        setLoading(false)
      })
    }
    return () => setCurrentProject(null)
  }, [id, setCurrentProject])

  if (loading || !currentProject) {
    return <div className="ax-page-body text-ax-text-muted text-xs">Loading project…</div>
  }

  const phase = currentProject.current_phase

  return (
    <div className="ax-page">
      <div className="ax-page-header">
        <div className="flex items-center gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-bold truncate">{currentProject.name}</h1>
            <p className="text-[10px] text-ax-text-muted truncate">{currentProject.client_name}</p>
          </div>
          {GATE_NAMES[phase] && (
            <button type="button" onClick={() => setShowGate(true)} className="ax-btn-success shrink-0">
              Review & Approve Gate
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {PHASE_ORDER.map((num, idx) => {
            const phaseName = PHASE_NAMES[num]
            const isComplete = num < phase
            const isCurrent = num === phase
            return (
              <div key={num} className="flex items-center">
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                  isComplete ? 'ax-phase-done' :
                  isCurrent ? 'ax-phase-current' :
                  'ax-phase-pending'
                }`}>
                  {isComplete ? <CheckCircle className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
                  {phaseName}
                </div>
                {idx < PHASE_ORDER.length - 1 && <ArrowRight className="w-3 h-3 text-ax-text-muted mx-0.5" />}
              </div>
            )
          })}
        </div>
      </div>

      <div className="ax-page-body max-w-5xl">
      <RetrievalStrategyPanel
        project={currentProject}
        onUpdated={(p) => setCurrentProject(p)}
      />
      <div className="ax-panel-pad mb-4 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xs font-semibold">
              Phase {phase}: {PHASE_NAMES[phase]}
            </h2>
            <p className="text-[10px] text-ax-text-muted mt-0.5">
              Status: {currentProject.phase_status}
            </p>
          </div>
        </div>

        {/* Phase A (-1): Architecture & Design — pre-build gate */}
        {phase === -1 && (
          <div className="space-y-6">
            <ArchitectureWorkspace
              projectId={currentProject.id}
              tier={currentProject.architecture_tier}
              onReadinessChange={(ready, outstandingCount) => {
                setArchReady(ready)
                setArchNotStarted(outstandingCount)
              }}
            />
            <p className="text-sm text-ax-text-muted text-center">
              Tell Cursor: "Follow <code className="bg-ax-bg-3 px-1 rounded">docs/{PHASE_DOC_FILES[-1]}</code>"
            </p>
          </div>
        )}

        {/* Phase 0: Pain Point Intake */}
        {phase === 0 && (
          <div className="space-y-6">
            <p className="text-sm text-ax-text-muted text-center">
              Tell Cursor: "Follow <code className="bg-ax-bg-3 px-1 rounded">docs/{PHASE_DOC_FILES[0]}</code>"
            </p>
            <PainPointForm
              projectId={currentProject.id}
              painPoints={currentProject.pain_points}
              onSaved={(painPoints) => {
                setCurrentProject({ ...currentProject, pain_points: painPoints })
              }}
            />
            {Object.keys(currentProject.signals || {}).length > 0 && (
              <SignalReview signals={currentProject.signals} />
            )}
          </div>
        )}

        {/* Phase 1-5: Placeholder content for Cursor to fill */}
        {phase >= 1 && phase <= 5 && (
          <div className="text-center py-12 text-ax-text-muted">
            <p className="text-lg">Phase {phase}: {PHASE_NAMES[phase]}</p>
            <p className="text-sm mt-2">
              Tell Cursor: "Follow <code className="bg-ax-bg-3 px-1 rounded">docs/{PHASE_DOC_FILES[phase]}</code>"
            </p>
          </div>
        )}
      </div>
      </div>

      {/* HITL Gate Overlay */}
      {showGate && GATE_NAMES[phase] && (
        <HITLGateOverlay
          projectId={currentProject.id}
          gateName={GATE_NAMES[phase]}
          phaseName={PHASE_NAMES[phase]}
          allowConditions={phase === -1}
          readinessWarning={
            phase === -1 && !archReady
              ? `${archNotStarted} document${archNotStarted === 1 ? '' : 's'} not yet approved. ` +
                `Approving now still advances to Phase 0 — make sure that's intentional.`
              : undefined
          }
          onClose={() => setShowGate(false)}
          onDecided={(result) => {
            setShowGate(false)
            if (result.approved) {
              setCurrentProject({
                ...currentProject,
                current_phase: result.current_phase,
                phase_status: 'in_progress',
              })
            }
          }}
        />
      )}
    </div>
  )
}
