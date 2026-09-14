import { useState, type ReactNode } from 'react'
import type { MatchCandidate, QlikDispositionResult, SignOffDecision } from '../types'
import { postSignOff } from '../services/api'
import Badge from './Badge'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="ax-label mb-0.5">{label}</div>
      <div className="text-[11px] text-ax-text">{children}</div>
    </div>
  )
}

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
      setError('Reviewer name/email is required.')
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
      setError('Failed to submit sign-off.')
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="ax-panel overflow-hidden sticky top-2">
      <div className="ax-panel-header">Candidate detail</div>
      <div className="ax-panel-body space-y-3 text-[11px]">
        <Field label="Qlik app">{qlikApp.qlik_app_name}</Field>
        <Field label="Power BI candidate">
          {candidate.pbi_name}
          <span className="block text-ax-text-muted">{candidate.pbi_workspace_name}</span>
        </Field>

        <div className="flex flex-wrap items-center gap-1">
          <Badge tone={candidate.confidence_tier}>{candidate.confidence_tier}</Badge>
          {candidate.disposition && <Badge tone={candidate.disposition}>{candidate.disposition}</Badge>}
          {candidate.effort && <span className="text-ax-text-muted">Effort: {candidate.effort}</span>}
        </div>

        <Field label="Lineage">{candidate.lineage_signal}</Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Name sim.">{candidate.name_similarity.toFixed(2)}</Field>
          <Field label="Measure overlap">{candidate.measure_overlap.toFixed(2)}</Field>
        </div>

        <div>
          <div className="ax-label mb-1">Signals</div>
          <div className="flex flex-wrap gap-0.5 mb-1">
            {candidate.signals_available.map((s) => (
              <span key={s} className="ax-badge-ok">
                ✓ {s.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-0.5">
            {candidate.signals_missing.map((s) => (
              <span key={s} className="ax-badge-muted">
                ✗ {s.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>

        {candidate.semantic_rationale && (
          <Field label={`Semantic match${candidate.llm_used ? '' : ' (fallback)'}`}>
            <p className="text-ax-text-dim leading-relaxed">{candidate.semantic_rationale}</p>
          </Field>
        )}

        {candidate.advisor_rationale && (
          <Field label="Advisor rationale">
            <p className="text-ax-text-dim leading-relaxed">{candidate.advisor_rationale}</p>
          </Field>
        )}

        <div className="border-t border-ax-border pt-3">
          <div className="ax-label mb-2">Human sign-off</div>
          {submitted ? (
            <div className="ax-badge-ok p-2 rounded">Sign-off recorded — see Backlog tab.</div>
          ) : (
            <div className="space-y-1.5">
              <select
                value={decision}
                onChange={(e) => setDecision(e.target.value as SignOffDecision)}
                className="ax-select"
              >
                <option value="confirmed">Confirm disposition</option>
                <option value="overridden">Override</option>
                <option value="needs_more_info">Needs more info</option>
              </select>
              <input
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="Reviewer"
                className="ax-input"
              />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="ax-textarea min-h-[48px]"
              />
              {error && <div className="text-[10px] ax-stat-value-danger">{error}</div>}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="ax-btn-primary w-full disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit sign-off'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
