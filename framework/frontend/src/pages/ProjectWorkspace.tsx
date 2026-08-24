import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { useProjectStore } from '../lib/stores/projectStore'
import { PHASE_NAMES, GATE_NAMES } from '../types'
import PainPointForm from '../components/PainPointForm'
import SignalReview from '../components/SignalReview'
import HITLGateOverlay from '../components/HITLGateOverlay'
import { CheckCircle, Circle, ArrowRight } from 'lucide-react'

export default function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>()
  const { currentProject, setCurrentProject } = useProjectStore()
  const [showGate, setShowGate] = useState(false)
  const [loading, setLoading] = useState(true)

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
    return <div className="p-8 text-gray-500">Loading project...</div>
  }

  const phase = currentProject.current_phase

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{currentProject.name}</h1>
        <p className="text-gray-500">{currentProject.client_name}</p>
      </div>

      {/* Phase Progress Bar */}
      <div className="mb-8 p-4 bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between">
          {Object.entries(PHASE_NAMES).map(([phaseNum, phaseName], idx) => {
            const num = parseInt(phaseNum)
            const isComplete = num < phase
            const isCurrent = num === phase
            return (
              <div key={num} className="flex items-center">
                <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${
                  isComplete ? 'bg-green-100 text-green-700' :
                  isCurrent ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isComplete ? <CheckCircle className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  {phaseName}
                </div>
                {idx < 6 && <ArrowRight className="w-4 h-4 text-gray-300 mx-1" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Phase Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">
              Phase {phase}: {PHASE_NAMES[phase]}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Status: {currentProject.phase_status}
            </p>
          </div>
          {GATE_NAMES[phase] && (
            <button
              onClick={() => setShowGate(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              Review & Approve Gate
            </button>
          )}
        </div>

        {/* Phase 0: Pain Point Intake */}
        {phase === 0 && (
          <div className="space-y-6">
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

        {/* Phase 1-6: Placeholder content for Cursor to fill */}
        {phase >= 1 && phase <= 6 && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">Phase {phase}: {PHASE_NAMES[phase]}</p>
            <p className="text-sm mt-2">
              Tell Cursor: "Follow <code className="bg-gray-100 px-1 rounded">docs/0{phase}-{PHASE_NAMES[phase].toLowerCase().replace(/ /g, '-')}.md</code>"
            </p>
          </div>
        )}
      </div>

      {/* HITL Gate Overlay */}
      {showGate && GATE_NAMES[phase] && (
        <HITLGateOverlay
          projectId={currentProject.id}
          gateName={GATE_NAMES[phase]}
          phaseName={PHASE_NAMES[phase]}
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
