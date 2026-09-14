import { useState } from 'react'
import { projectsApi } from '../../lib/api'
import type { Project } from '../../types'

const MODES = ['graph', 'structured', 'vector', 'hybrid'] as const

export function RetrievalStrategyPanel({
  project,
  onUpdated,
}: {
  project: Project
  onUpdated: (p: Project) => void
}) {
  const strategy = project.retrieval_strategy || {}
  const [defaultMode, setDefaultMode] = useState(strategy.default || 'hybrid')
  const [agentsJson, setAgentsJson] = useState(
    JSON.stringify(strategy.agents || {}, null, 2),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      let agents: Record<string, string> = {}
      if (agentsJson.trim()) {
        agents = JSON.parse(agentsJson) as Record<string, string>
      }
      const { data } = await projectsApi.update(project.id, {
        retrieval_strategy: { default: defaultMode, agents },
      })
      onUpdated(data as Project)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON or save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ax-panel-pad">
      <h3 className="text-xs font-semibold mb-1">Retrieval Strategy</h3>
      <p className="text-[10px] text-ax-text-muted mb-3">
        Per-project RAG map — not every agent uses Graph RAG. SDK resolves agents.* then default.
      </p>
      <div className="space-y-3">
        <div>
          <label className="ax-label">Default mode</label>
          <select
            className="ax-select max-w-xs"
            value={defaultMode}
            onChange={(e) => setDefaultMode(e.target.value)}
          >
            {MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="ax-label">Per-agent overrides (JSON)</label>
          <textarea
            className="ax-textarea font-mono text-[10px] min-h-[100px]"
            value={agentsJson}
            onChange={(e) => setAgentsJson(e.target.value)}
            placeholder='{"my_agent": "vector"}'
          />
        </div>
        {error && <div className="ax-alert-err">{error}</div>}
        <button type="button" onClick={() => void save()} disabled={saving} className="ax-btn-primary">
          {saving ? 'Saving…' : 'Save strategy'}
        </button>
      </div>
    </div>
  )
}
