import { useState } from 'react'
import { projectsApi } from '../lib/api'

const SECTIONS = [
  { key: 'domain_context', label: 'Domain Context', placeholder: 'Industry, company profile, operational scope...' },
  { key: 'problem_statement', label: 'Problem Statement', placeholder: 'Pain points, current failures, what\'s broken...' },
  { key: 'business_impact', label: 'Business Impact', placeholder: 'Financial metrics, costs, revenue impact...' },
  { key: 'decision_needs', label: 'Decision Needs', placeholder: 'Questions you need answered, decisions you need to make...' },
  { key: 'current_process', label: 'Current Process', placeholder: 'Existing workflows, systems in use, manual steps...' },
]

interface Props {
  projectId: string
  painPoints: Record<string, string>
  onSaved: (painPoints: Record<string, string>) => void
}

export default function PainPointForm({ projectId, painPoints, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>(painPoints || {})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await projectsApi.update(projectId, { pain_points: values })
      onSaved(values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const hasContent = Object.values(values).some((v) => v && v.trim().length > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Client Pain Points</h3>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving || !hasContent}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
          >
            {saving ? 'Saving...' : 'Save Pain Points'}
          </button>
        </div>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {section.label}
          </label>
          <textarea
            value={values[section.key] || ''}
            onChange={(e) => setValues({ ...values, [section.key]: e.target.value })}
            rows={4}
            placeholder={section.placeholder}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      ))}
    </div>
  )
}
