import { useState } from 'react'
import { projectsApi } from '../lib/api'
import { X, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

interface Props {
  projectId: string
  gateName: string
  phaseName: string
  onClose: () => void
  onDecided: (result: { approved: boolean; current_phase: number }) => void
  /** Optional warning shown above the decision (e.g. "3 documents not started yet"). */
  readinessWarning?: string
  /** Show the "open issues / conditions" field for an "approve with conditions" outcome. */
  allowConditions?: boolean
}

export default function HITLGateOverlay({
  projectId, gateName, phaseName, onClose, onDecided, readinessWarning, allowConditions,
}: Props) {
  const [notes, setNotes] = useState('')
  const [conditionsText, setConditionsText] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDecision = async (approved: boolean) => {
    setLoading(true)
    try {
      const conditions = conditionsText
        .split('\n')
        .map((c) => c.trim())
        .filter(Boolean)
      const { data } = await projectsApi.decideGate(projectId, gateName, {
        approved,
        reviewer: 'consultant',
        notes: notes || undefined,
        conditions: approved && conditions.length ? conditions : undefined,
      })
      onDecided({ approved: data.status === 'approved', current_phase: data.current_phase })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">HITL Gate: {phaseName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Review the work completed in this phase. Approve to advance to the next
          phase, or reject to request changes.
        </p>

        {readinessWarning && (
          <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{readinessWarning}</span>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Any feedback or modifications..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>

        {allowConditions && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Open issues / conditions (optional — one per line)
            </label>
            <textarea
              value={conditionsText}
              onChange={(e) => setConditionsText(e.target.value)}
              rows={2}
              placeholder="e.g. Confirm data retention policy with legal before Phase 0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Listing conditions still approves and advances the phase — it just keeps the open
              issues on record ("approved with conditions") instead of dropping them.
            </p>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handleDecision(false)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50 text-sm transition-colors"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={() => handleDecision(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm transition-colors"
          >
            <CheckCircle className="w-4 h-4" />
            Approve & Advance
          </button>
        </div>
      </div>
    </div>
  )
}
