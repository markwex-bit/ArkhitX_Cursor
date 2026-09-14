import { useEffect, useState } from 'react'
import { architectureApi } from '../../lib/api'
import type { ArchitectureDocument } from '../../types'
import { Sparkles, X } from 'lucide-react'

interface Props {
  projectId: string
  document: ArchitectureDocument
  guidance: string
  onClose: () => void
  onSaved: (doc: ArchitectureDocument) => void
}

const STATUS_OPTIONS = ['not_started', 'draft', 'in_review', 'approved'] as const

export default function DocumentEditor({ projectId, document: doc, guidance, onClose, onSaved }: Props) {
  const [content, setContent] = useState(doc.content)
  const [status, setStatus] = useState(doc.status)
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setContent(doc.content)
    setStatus(doc.status)
    setDirty(false)
  }, [doc.doc_key, doc.content, doc.status])

  const handleSave = async (nextStatus?: typeof status) => {
    setSaving(true)
    try {
      const { data } = await architectureApi.updateDocument(projectId, doc.doc_key, {
        content,
        status: nextStatus ?? status,
      })
      setStatus(data.status)
      setDirty(false)
      onSaved(data)
    } finally {
      setSaving(false)
    }
  }

  const handleDraft = async () => {
    setDrafting(true)
    try {
      const hasContent = content.trim().length > 0
      const { data } = await architectureApi.draftDocument(projectId, doc.doc_key, hasContent)
      setContent(data.content)
      setStatus(data.status)
      onSaved(data)
    } finally {
      setDrafting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{doc.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{guidance}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-700">Content (Markdown)</label>
            <button
              onClick={handleDraft}
              disabled={drafting}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {drafting ? 'Drafting...' : content.trim() ? 'Redraft with AI' : 'Draft with AI'}
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setDirty(true)
            }}
            rows={18}
            placeholder="Write or generate this document's content..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          />
        </div>

        <div className="flex items-center justify-between p-5 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm">
              Close
            </button>
            <button
              onClick={() => handleSave()}
              disabled={saving || (!dirty && status === doc.status)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
