import { useState } from 'react'
import { architectureApi } from '../../lib/api'
import type { ArchitectureDecision } from '../../types'
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  projectId: string
  decisions: ArchitectureDecision[]
  onChange: (decisions: ArchitectureDecision[]) => void
}

const STATUS_COLORS: Record<string, string> = {
  proposed: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-500/15 text-emerald-400',
  superseded: 'bg-ax-bg-3 text-ax-text-muted',
}

const EMPTY_FORM = {
  title: '',
  context: '',
  decision: '',
  consequences: '',
  status: 'proposed' as const,
  options_considered: [{ option: '', pros: '', cons: '' }],
}

export default function DecisionLog({ projectId, decisions, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const handleCreate = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const { data } = await architectureApi.createDecision(projectId, {
        ...form,
        options_considered: form.options_considered.filter((o) => o.option.trim()),
      })
      onChange([...decisions, data])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await architectureApi.deleteDecision(projectId, id)
    onChange(decisions.filter((d) => d.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-ax-text">Architecture Decision Records</h3>
          <p className="text-xs text-ax-text-muted mt-0.5">
            One entry per consequential choice — LLM provider, agent framework, retrieval
            strategy, cloud target, etc. Context, alternatives, decision, consequences.
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 bg-ax-primary text-white rounded-lg hover:bg-ax-primary-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          New ADR
        </button>
      </div>

      {showForm && (
        <div className="p-4 bg-ax-bg-3 rounded-lg border border-ax-border space-y-3">
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Decision title, e.g. 'Choice of retrieval strategy for supplier lookup'"
            className="w-full px-3 py-2 border border-ax-border rounded-lg text-sm"
          />
          <textarea
            value={form.context}
            onChange={(e) => setForm({ ...form, context: e.target.value })}
            placeholder="Context — why does this decision need to be made?"
            rows={2}
            className="w-full px-3 py-2 border border-ax-border rounded-lg text-sm"
          />
          <div className="space-y-2">
            <label className="text-xs font-medium text-ax-text-dim">Options considered</label>
            {form.options_considered.map((opt, i) => (
              <div key={i} className="grid grid-cols-3 gap-2">
                <input
                  value={opt.option}
                  onChange={(e) => {
                    const next = [...form.options_considered]
                    next[i] = { ...next[i], option: e.target.value }
                    setForm({ ...form, options_considered: next })
                  }}
                  placeholder="Option"
                  className="px-2 py-1.5 border border-ax-border rounded text-xs"
                />
                <input
                  value={opt.pros}
                  onChange={(e) => {
                    const next = [...form.options_considered]
                    next[i] = { ...next[i], pros: e.target.value }
                    setForm({ ...form, options_considered: next })
                  }}
                  placeholder="Pros"
                  className="px-2 py-1.5 border border-ax-border rounded text-xs"
                />
                <input
                  value={opt.cons}
                  onChange={(e) => {
                    const next = [...form.options_considered]
                    next[i] = { ...next[i], cons: e.target.value }
                    setForm({ ...form, options_considered: next })
                  }}
                  placeholder="Cons"
                  className="px-2 py-1.5 border border-ax-border rounded text-xs"
                />
              </div>
            ))}
            <button
              onClick={() =>
                setForm({
                  ...form,
                  options_considered: [...form.options_considered, { option: '', pros: '', cons: '' }],
                })
              }
              className="text-xs text-ax-primary-light hover:text-blue-800"
            >
              + add option
            </button>
          </div>
          <textarea
            value={form.decision}
            onChange={(e) => setForm({ ...form, decision: e.target.value })}
            placeholder="Decision — what was chosen"
            rows={2}
            className="w-full px-3 py-2 border border-ax-border rounded-lg text-sm"
          />
          <textarea
            value={form.consequences}
            onChange={(e) => setForm({ ...form, consequences: e.target.value })}
            placeholder="Consequences — tradeoffs accepted"
            rows={2}
            className="w-full px-3 py-2 border border-ax-border rounded-lg text-sm"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-ax-text-dim">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.title.trim()}
              className="px-3 py-1.5 bg-ax-primary text-white rounded-lg text-sm hover:bg-ax-primary-hover disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Log decision'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {decisions.map((d) => (
          <div key={d.id} className="border border-ax-border rounded-lg">
            <button
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              className="w-full flex items-center justify-between p-3 text-left"
            >
              <div className="flex items-center gap-2">
                {expanded === d.id ? (
                  <ChevronDown className="w-4 h-4 text-ax-text-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-ax-text-muted" />
                )}
                <span className="text-sm font-medium text-ax-text">{d.title}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status]}`}>
                {d.status}
              </span>
            </button>
            {expanded === d.id && (
              <div className="px-3 pb-3 space-y-2 text-sm">
                {d.context && <p><span className="font-medium text-ax-text-dim">Context: </span>{d.context}</p>}
                {d.options_considered.length > 0 && (
                  <div>
                    <span className="font-medium text-ax-text-dim">Options considered:</span>
                    <ul className="list-disc pl-5 mt-1 space-y-0.5">
                      {d.options_considered.map((o, i) => (
                        <li key={i}>
                          <span className="font-medium">{o.option}</span>
                          {o.pros && <span className="text-emerald-400"> +{o.pros}</span>}
                          {o.cons && <span className="text-red-600"> -{o.cons}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.decision && <p><span className="font-medium text-ax-text-dim">Decision: </span>{d.decision}</p>}
                {d.consequences && (
                  <p><span className="font-medium text-ax-text-dim">Consequences: </span>{d.consequences}</p>
                )}
                <button
                  onClick={() => handleDelete(d.id)}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-400 mt-2"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {decisions.length === 0 && !showForm && (
          <p className="text-sm text-ax-text-muted text-center py-4">No ADRs logged yet.</p>
        )}
      </div>
    </div>
  )
}
