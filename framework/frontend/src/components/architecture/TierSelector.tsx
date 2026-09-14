import { useState } from 'react'
import { architectureApi } from '../../lib/api'
import { CheckCircle2, FileText, Layers } from 'lucide-react'

interface Props {
  projectId: string
  lightweightCount: number
  fullCount: number
  onChosen: () => void
}

const TIER_COPY = {
  lightweight: {
    label: 'Lightweight',
    icon: FileText,
    blurb: 'For small, low-risk builds (single team, no external compliance exposure).',
    includes: [
      'Problem statement & success criteria',
      'Requirements summary (functional + non-functional combined)',
      'System context diagram',
      'Risk register',
      'Architecture review summary',
    ],
  },
  full: {
    label: 'Full Package',
    icon: Layers,
    blurb: 'For enterprise-scale, compliance-sensitive, or multi-stakeholder engagements.',
    includes: [
      'Everything in Lightweight, plus:',
      'Stakeholder map & RACI, detailed functional/non-functional/data requirements',
      'Component diagram, draft domain model, agent architecture, retrieval strategy',
      'Data flow, integration & security architecture, tech stack matrix',
      'Cost estimate, deployment topology, observability plan, traceability matrix',
    ],
  },
} as const

export default function TierSelector({ projectId, lightweightCount, fullCount, onChosen }: Props) {
  const [selected, setSelected] = useState<'lightweight' | 'full' | null>(null)
  const [reviewMode, setReviewMode] = useState<'self' | 'stakeholder'>('self')
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await architectureApi.setTier(projectId, selected, reviewMode)
      onChosen()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-gray-900">Choose an architecture package</h3>
        <p className="text-sm text-gray-500 mt-1">
          Not every engagement needs the full document set. Pick the tier that matches this
          project's scale and risk — you can upgrade to Full later without losing work.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(['lightweight', 'full'] as const).map((tier) => {
          const copy = TIER_COPY[tier]
          const Icon = copy.icon
          const count = tier === 'lightweight' ? lightweightCount : fullCount
          const isSelected = selected === tier
          return (
            <button
              key={tier}
              onClick={() => setSelected(tier)}
              className={`text-left p-5 rounded-xl border-2 transition-colors ${
                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-900">{copy.label}</span>
                </div>
                {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-600" />}
              </div>
              <p className="text-xs text-gray-500 mb-1">{count} documents</p>
              <p className="text-sm text-gray-600 mb-3">{copy.blurb}</p>
              <ul className="space-y-1">
                {copy.includes.map((line, i) => (
                  <li key={i} className="text-xs text-gray-500 flex gap-1.5">
                    <span className="text-gray-300">&bull;</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">Review format</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={reviewMode === 'self'}
                onChange={() => setReviewMode('self')}
              />
              Self-approved (fast — solo/internal projects)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                checked={reviewMode === 'stakeholder'}
                onChange={() => setReviewMode('stakeholder')}
              />
              Stakeholder-ready (formal — client/peer review expected)
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
            >
              {saving ? 'Setting up...' : `Start ${TIER_COPY[selected].label} package`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
