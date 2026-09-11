import { useState } from 'react'
import type { MatchCandidate, QlikDispositionResult, SignOffDecision } from '../types'
import { postSignOff } from '../services/api'
import Badge from './Badge'

export default function DetailPane({
  qlikApp,
  candidate,
  onSignedOff,
}: {
  qlikApp: QlikDispositionResult
  candidate: MatchCandidate
  onSignedOff: () => void
}) {
  const [decision, setDecision] = useState<SignOffDecision>('confirmed')
  const [reviewer, setReviewer] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!reviewer.trim()) {
      setError('Reviewer name/email is required — this is a human sign-off gate.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await postSignOff({
        qlik_app_id: qlikApp.qlik_app_id,
        pbi_dataset_id: candidate.pbi_dataset_id,
        decision,
        reviewer,
        notes,
      })
      setSubmitted(true)
      onSignedOff()
    } catch (e) {
      setError('Failed to submit sign-off. See console for details.')
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 sticky top-6 space-y-5">
      <div>
        <div className="text-xs text-gray-500 mb-1">Qlik app</div>
        <div className="font-semibold text-gray-900">{qlikApp.qlik_app_name}</div>
        <div className="text-xs text-gray-500 mt-2 mb-1">Power BI candidate</div>
        <div className="font-semibold text-gray-900">{candidate.pbi_name}</div>
        <div className="text-xs text-gray-500">{candidate.pbi_workspace_name}</div>
      </div>

      <div className="flex items-center gap-2">
        <Badge tone={candidate.confidence_tier}>{candidate.confidence_tier} confidence</Badge>
        {candidate.disposition && <Badge tone={candidate.disposition}>{candidate.disposition}</Badge>}
        {candidate.effort && <span className="text-xs text-gray-500">Effort: {candidate.effort}</span>}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1">Lineage signal</div>
        <div className="text-sm text-gray-700">{candidate.lineage_signal}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">Name similarity</div>
          <div className="text-gray-700">{candidate.name_similarity.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">Measure overlap</div>
          <div className="text-gray-700">{candidate.measure_overlap.toFixed(2)}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-600 mb-1">
          Signals available vs. missing
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          {candidate.signals_available.map((s) => (
            <span key={s} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
              ✓ {s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {candidate.signals_missing.map((s) => (
            <span key={s} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
              ✗ {s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {candidate.semantic_rationale && (
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">
            AI semantic match {candidate.llm_used ? '' : '(fallback — LLM unavailable)'}
          </div>
          <p className="text-sm text-gray-700">{candidate.semantic_rationale}</p>
          {candidate.matched_concepts.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">Matched concepts</div>
              <ul className="text-xs text-gray-700 list-disc list-inside space-y-0.5">
                {candidate.matched_concepts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {candidate.unmatched_concepts.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">Unmatched / gap concepts</div>
              <ul className="text-xs text-gray-700 list-disc list-inside space-y-0.5">
                {candidate.unmatched_concepts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {candidate.advisor_rationale && (
        <div>
          <div className="text-xs font-semibold text-gray-600 mb-1">
            AI migration advisor rationale
          </div>
          <p className="text-sm text-gray-700">{candidate.advisor_rationale}</p>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-semibold text-gray-600 mb-2">
          Human sign-off (required — nothing above is a final decision)
        </div>
        {submitted ? (
          <div className="text-sm text-emerald-700 bg-emerald-50 rounded p-3">
            Sign-off recorded. Check the Backlog tab.
          </div>
        ) : (
          <div className="space-y-2">
            <select
              value={decision}
              onChange={(e) => setDecision(e.target.value as SignOffDecision)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              <option value="confirmed">Confirm — proceed with this disposition</option>
              <option value="overridden">Override — I disagree, use my notes</option>
              <option value="needs_more_info">Needs more info — not actionable yet</option>
            </select>
            <input
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              placeholder="Reviewer name or email"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={2}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
            {error && <div className="text-xs text-rose-600">{error}</div>}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white text-sm font-medium rounded px-3 py-1.5"
            >
              {submitting ? 'Submitting…' : 'Submit sign-off'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
