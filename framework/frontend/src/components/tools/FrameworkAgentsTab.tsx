import { useCallback, useEffect, useState } from 'react'
import { applicationsApi, arkhitxAgentsApi, governanceApi } from '../../lib/api'
import { AuditLogEntry } from '../../types'
import { RefreshCw, Play, Clock, CheckCircle, XCircle } from 'lucide-react'

interface AppEntry {
  slug: string
  name: string
  phase: number
  on_disk: boolean
  project_id?: string | null
}

interface ExtraField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
}

interface AgentDef {
  id: string
  name: string
  description: string
  icon: string
  requiresSlug: boolean
  extraFields?: ExtraField[]
  trigger: (slug: string, extra: Record<string, string>) => Promise<{ data: unknown }>
}

const ARKHITX_AGENTS: AgentDef[] = [
  {
    id: 'arkhitx-ontology-extractor',
    name: 'Ontology Extractor',
    description:
      'Reads project Python source files and generates an ontology schema saved to ontology/{slug}.json.',
    icon: '🔍',
    requiresSlug: true,
    trigger: (slug) => arkhitxAgentsApi.extractOntology(slug),
  },
  {
    id: 'arkhitx-compliance-detector',
    name: 'Compliance Detector',
    description:
      'Analyses project agent code against the 7 ArkhitX governance rules. Pre-fills the Wiring Checklist.',
    icon: '🛡️',
    requiresSlug: true,
    trigger: (slug) => arkhitxAgentsApi.detectCompliance(slug),
  },
  {
    id: 'arkhitx-grounding-query-generator',
    name: 'Grounding Query Generator',
    description:
      'Generates the _grounding_query() Python method for a specific application agent based on ontology.',
    icon: '⚡',
    requiresSlug: true,
    extraFields: [
      { key: 'agent_name', label: 'Agent Class Name', type: 'text', placeholder: 'e.g. ContractRiskAgent' },
      {
        key: 'agent_purpose',
        label: 'What the agent does',
        type: 'textarea',
        placeholder: 'e.g. Scores each contract clause RED/AMBER/GREEN based on risk',
      },
    ],
    trigger: (slug, extra) =>
      arkhitxAgentsApi.generateGroundingQuery(slug, extra.agent_name ?? '', extra.agent_purpose ?? ''),
  },
  {
    id: 'arkhitx-grounding-query-builder',
    name: 'Grounding Query Builder',
    description:
      'Given a task description, returns the targeted Cypher query for relevant GovernanceRule nodes.',
    icon: '🔗',
    requiresSlug: false,
    extraFields: [
      {
        key: 'task_description',
        label: 'Task Description',
        type: 'textarea',
        placeholder: 'e.g. Write a new base agent class for the contract review application',
      },
    ],
    trigger: (_slug, extra) => arkhitxAgentsApi.buildGroundingQuery(extra.task_description ?? ''),
  },
  {
    id: 'arkhitx-compliance-checker',
    name: 'Compliance Checker',
    description:
      'Real-time quality gate on AI-generated outputs. Checks governance rule violations before delivery.',
    icon: '✅',
    requiresSlug: false,
    extraFields: [
      {
        key: 'task_context',
        label: 'Task Context (optional)',
        type: 'text',
        placeholder: 'e.g. User asked the AI to write a new agent class',
      },
      {
        key: 'proposed_output',
        label: 'Proposed AI Output',
        type: 'textarea',
        placeholder: 'Paste the AI-generated text to check…',
      },
    ],
    trigger: (_slug, extra) =>
      arkhitxAgentsApi.checkCompliance(extra.proposed_output ?? '', extra.task_context),
  },
  {
    id: 'arkhitx-phase-gate-validator',
    name: 'Phase Gate Validator',
    description:
      'Checks whether a project meets all conditions required to advance to the next phase.',
    icon: '🚦',
    requiresSlug: true,
    extraFields: [
      {
        key: 'target_phase',
        label: 'Advance to Phase',
        type: 'select',
        options: [
          { value: '1', label: 'Phase 1 — Register' },
          { value: '2', label: 'Phase 2 — Seed Graph' },
          { value: '3', label: 'Phase 3 — Wire Governance' },
        ],
      },
    ],
    trigger: (slug, extra) =>
      arkhitxAgentsApi.validatePhaseGate(slug, parseInt(extra.target_phase ?? '1')),
  },
]

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function PhaseGateResult({ data }: { data: Record<string, unknown> }) {
  const canAdvance = data.can_advance as boolean
  const passed = (data.gates_passed as string[]) ?? []
  const failed = (data.gates_failed as string[]) ?? []
  const action = data.action_required as string

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 font-semibold text-sm ${canAdvance ? 'text-emerald-400' : 'text-ax-red'}`}>
        {canAdvance ? (
          <>
            <CheckCircle className="w-5 h-5" /> Gate passed — ready to advance to Phase {data.target_phase as number}
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5" /> Gate blocked — {failed.length} condition{failed.length !== 1 ? 's' : ''} not met
          </>
        )}
      </div>
      {passed.length > 0 && (
        <div className="space-y-1">
          {passed.map((g, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{g}</span>
            </div>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <div className="space-y-1">
          {failed.map((g, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-ax-red">
              <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{g}</span>
            </div>
          ))}
        </div>
      )}
      {action && (
        <div className="ax-alert-warn text-sm">
          <p className="font-semibold mb-1">What to do:</p>
          <p>{action}</p>
        </div>
      )}
    </div>
  )
}

function ComplianceResult({ data }: { data: Record<string, unknown> }) {
  const compliant = data.overall_compliant as boolean
  const rules = (data.rule_results as { rule_id: string; status: string; reason: string }[]) ?? []
  const recommendation = data.recommendation as string
  const score = data.grounding_score as number | undefined

  const statusColor = (s: string) =>
    ({
      COMPLIANT: 'text-emerald-400 bg-emerald-500/10',
      VIOLATED: 'text-ax-red bg-red-500/10',
      NOT_APPLICABLE: 'text-ax-text-muted bg-ax-bg-3',
    })[s] ?? 'text-ax-text-dim bg-ax-bg-3'

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 font-semibold text-sm ${compliant ? 'text-emerald-400' : 'text-ax-red'}`}>
        {compliant ? (
          <>
            <CheckCircle className="w-5 h-5" /> Output is compliant
          </>
        ) : (
          <>
            <XCircle className="w-5 h-5" /> Violations detected
          </>
        )}
        {score !== undefined && (
          <span className="ml-auto font-mono text-xs text-ax-text-muted">
            Grounding: {Math.round(score * 100)}%
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {rules.map((r) => (
          <div key={r.rule_id} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${statusColor(r.status)}`}>
            <span className="font-mono font-semibold shrink-0">{r.rule_id}</span>
            <span className="font-semibold shrink-0">{r.status}</span>
            <span className="text-ax-text-dim">{r.reason}</span>
          </div>
        ))}
      </div>
      {recommendation && (
        <div className="ax-alert-warn text-sm">
          <p className="font-semibold mb-1">Recommendation:</p>
          <p>{recommendation}</p>
        </div>
      )}
    </div>
  )
}

export function FrameworkAgentsTab() {
  const [apps, setApps] = useState<AppEntry[]>([])
  const [recentLogs, setRecentLogs] = useState<AuditLogEntry[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, unknown>>({})
  const [selectedSlug, setSelectedSlug] = useState<Record<string, string>>({})
  const [extraInputs, setExtraInputs] = useState<Record<string, Record<string, string>>>({})

  const load = useCallback(async () => {
    const [appsRes, logsRes] = await Promise.all([
      applicationsApi.list(),
      governanceApi.auditLogs({ limit: 100 }),
    ])
    setApps(appsRes.data)
    setRecentLogs(logsRes.data.filter((l: AuditLogEntry) => l.actor.includes('arkhitx')))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setExtra = (agentId: string, key: string, val: string) =>
    setExtraInputs((prev) => ({
      ...prev,
      [agentId]: { ...(prev[agentId] ?? {}), [key]: val },
    }))

  const runAgent = async (agent: AgentDef) => {
    const slug = selectedSlug[agent.id] ?? ''
    if (agent.requiresSlug && !slug) return
    const extra = extraInputs[agent.id] ?? {}

    setRunning(agent.id)
    setResults((prev) => ({ ...prev, [agent.id]: null }))
    try {
      const { data } = await agent.trigger(slug, extra)
      setResults((prev) => ({ ...prev, [agent.id]: data }))
      void load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setResults((prev) => ({ ...prev, [agent.id]: { error: msg } }))
    } finally {
      setRunning(null)
    }
  }

  const agentLogs = (agentId: string) =>
    recentLogs.filter((l) => l.actor.includes(agentId.replace('arkhitx-', '')))

  const canRun = (agent: AgentDef) => {
    if (agent.requiresSlug && !selectedSlug[agent.id]) return false
    const extra = extraInputs[agent.id] ?? {}
    if (agent.extraFields) {
      const required = agent.extraFields.filter((f) => !f.placeholder?.includes('optional'))
      return required.every((f) => !!extra[f.key])
    }
    return true
  }

  const renderResult = (agentId: string, data: unknown) => {
    if (!data) return null
    const obj = data as Record<string, unknown>
    if (obj.error) {
      return <div className="ax-alert-err text-xs">{String(obj.error)}</div>
    }
    if (agentId === 'arkhitx-phase-gate-validator') return <PhaseGateResult data={obj} />
    if (agentId === 'arkhitx-compliance-checker') return <ComplianceResult data={obj} />
    return (
      <pre className="text-xs text-ax-text-dim bg-ax-bg-2 border border-ax-border rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="ax-alert-info">
        <strong>ArkhitX Internal Agents</strong> — All 6 agents are self-governed: they log to the audit trail and
        ground against the GovernanceRule / ProjectPhase knowledge graph.
      </div>

      {ARKHITX_AGENTS.map((agent) => {
        const logs = agentLogs(agent.id)
        const result = results[agent.id]
        const isRunning = running === agent.id
        const slug = selectedSlug[agent.id] ?? ''
        const extra = extraInputs[agent.id] ?? {}
        const ready = canRun(agent) && !isRunning

        return (
          <div key={agent.id} className="ax-panel overflow-hidden">
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{agent.icon}</span>
                  <div>
                    <h3 className="font-semibold text-ax-text">{agent.name}</h3>
                    <p className="text-sm text-ax-text-muted mt-0.5 max-w-xl">{agent.description}</p>
                    <p className="text-xs text-ax-text-muted font-mono mt-1">{agent.id}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void runAgent(agent)}
                  disabled={!ready}
                  className="ax-btn-primary shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Running…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" /> Run
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-3">
                {agent.requiresSlug && (
                  <div>
                    <label className="ax-label">Application</label>
                    <select
                      value={slug}
                      onChange={(e) => setSelectedSlug((prev) => ({ ...prev, [agent.id]: e.target.value }))}
                      className="ax-select max-w-xs"
                    >
                      <option value="">Select app…</option>
                      {apps.map((a) => (
                        <option key={a.slug} value={a.slug}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {agent.extraFields?.map((field) => (
                  <div key={field.key}>
                    <label className="ax-label">{field.label}</label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={extra[field.key] ?? ''}
                        onChange={(e) => setExtra(agent.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                        className="ax-textarea"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={extra[field.key] ?? ''}
                        onChange={(e) => setExtra(agent.id, field.key, e.target.value)}
                        className="ax-select max-w-xs"
                      >
                        <option value="">Select…</option>
                        {field.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={extra[field.key] ?? ''}
                        onChange={(e) => setExtra(agent.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="ax-input"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {result !== undefined && result !== null && (
              <div className="px-5 pb-5">
                <p className="ax-section-title mb-2">Result</p>
                {renderResult(agent.id, result)}
              </div>
            )}

            {logs.length > 0 && (
              <div className="px-5 pb-4 border-t border-ax-border/60 pt-3">
                <p className="ax-section-title mb-2">Recent Calls ({logs.length})</p>
                <div className="space-y-1">
                  {logs.slice(0, 3).map((log) => (
                    <div key={log.id} className="flex items-center gap-2 text-xs text-ax-text-muted">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span>{fmtDate(log.created_at)}</span>
                      <span>·</span>
                      <span className="font-mono text-ax-primary-light">{log.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
