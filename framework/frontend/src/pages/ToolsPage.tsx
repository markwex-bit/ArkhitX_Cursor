import { useEffect, useState, useCallback } from 'react'
import { governanceApi, applicationsApi, arkhitxAgentsApi } from '../lib/api'
import { AgentPrompt, AuditLogEntry, GroundingRecord } from '../types'
import {
  Save, Edit3, Database, Bot, FileText,
  RefreshCw, Play, ChevronRight, ChevronDown,
  Clock, CheckCircle, AlertTriangle, Table2, XCircle,
} from 'lucide-react'

type Tab = 'prompts' | 'database' | 'agents'
type DbTable = 'apps' | 'prompts' | 'audit_logs' | 'grounding'

// ─── type for registered app list item ────────────────────────────────────────
interface AppEntry {
  slug: string
  name: string
  phase: number
  on_disk: boolean
  project_id?: string | null
}

// ─── Field descriptor for extra inputs ────────────────────────────────────────
interface ExtraField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select'
  placeholder?: string
  options?: { value: string; label: string }[]
}

// ─── Agent descriptor ─────────────────────────────────────────────────────────
interface AgentDef {
  id: string
  name: string
  description: string
  icon: string
  requiresSlug: boolean
  extraFields?: ExtraField[]
  trigger: (slug: string, extra: Record<string, string>) => Promise<{ data: unknown }>
}

// ─── ArkhitX internal agents catalog ─────────────────────────────────────────
const ARKHITX_AGENTS: AgentDef[] = [
  {
    id: 'arkhitx-ontology-extractor',
    name: 'Ontology Extractor',
    description: 'Reads project Python source files and generates an ontology schema (entity types, relationships, properties) saved to ontology/{slug}.json.',
    icon: '🔍',
    requiresSlug: true,
    trigger: (slug) => arkhitxAgentsApi.extractOntology(slug),
  },
  {
    id: 'arkhitx-compliance-detector',
    name: 'Compliance Detector',
    description: 'Analyses project agent code against the 7 ArkhitX governance rules. Pre-fills the Wiring Checklist with COMPLIANT / PARTIAL / MISSING findings per rule.',
    icon: '🛡️',
    requiresSlug: true,
    trigger: (slug) => arkhitxAgentsApi.detectCompliance(slug),
  },
  {
    id: 'arkhitx-grounding-query-generator',
    name: 'Grounding Query Generator',
    description: 'Generates the _grounding_query() Python method for a specific application agent based on its purpose and the registered ontology.',
    icon: '⚡',
    requiresSlug: true,
    extraFields: [
      { key: 'agent_name', label: 'Agent Class Name', type: 'text', placeholder: 'e.g. ContractRiskAgent' },
      { key: 'agent_purpose', label: 'What the agent does', type: 'textarea', placeholder: 'e.g. Scores each contract clause RED/AMBER/GREEN based on risk' },
    ],
    trigger: (slug, extra) =>
      arkhitxAgentsApi.generateGroundingQuery(slug, extra.agent_name ?? '', extra.agent_purpose ?? ''),
  },
  {
    id: 'arkhitx-grounding-query-builder',
    name: 'Grounding Query Builder',
    description: 'Given a task description, returns the targeted Cypher query that retrieves only the relevant GovernanceRule nodes — not all 7 every time. Used internally by the Compliance Checker.',
    icon: '🔗',
    requiresSlug: false,
    extraFields: [
      { key: 'task_description', label: 'Task Description', type: 'textarea', placeholder: 'e.g. Write a new base agent class for the contract review application' },
    ],
    trigger: (_slug, extra) => arkhitxAgentsApi.buildGroundingQuery(extra.task_description ?? ''),
  },
  {
    id: 'arkhitx-compliance-checker',
    name: 'Compliance Checker',
    description: 'Real-time quality gate on AI-generated outputs. Checks whether a proposed response violates any governance rules before it reaches the user.',
    icon: '✅',
    requiresSlug: false,
    extraFields: [
      { key: 'task_context', label: 'Task Context (optional)', type: 'text', placeholder: 'e.g. User asked the AI to write a new agent class' },
      { key: 'proposed_output', label: 'Proposed AI Output', type: 'textarea', placeholder: 'Paste the AI-generated text to check…' },
    ],
    trigger: (_slug, extra) =>
      arkhitxAgentsApi.checkCompliance(extra.proposed_output ?? '', extra.task_context),
  },
  {
    id: 'arkhitx-phase-gate-validator',
    name: 'Phase Gate Validator',
    description: 'Checks whether a project meets all conditions required to advance to the next phase. Blocks advancement if artifacts are missing or incomplete.',
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

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function Score({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-400">—</span>
  const pct = Math.round(v * 100)
  const color = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'
  return <span className={`font-mono font-semibold ${color}`}>{pct}%</span>
}

// ─── Prompts Tab ──────────────────────────────────────────────────────────────
function PromptsTab() {
  const [prompts, setPrompts] = useState<AgentPrompt[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<AgentPrompt>>({})
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    governanceApi.listPrompts().then(({ data }) => setPrompts(data))
  }, [])

  useEffect(() => { load() }, [load])

  const startEdit = (p: AgentPrompt) => {
    setEditing(p.id)
    setExpanded(p.id)
    setEditData({ system_prompt: p.system_prompt, model: p.model, temperature: p.temperature, max_tokens: p.max_tokens })
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await governanceApi.updatePrompt(editing, editData)
      load()
      setEditing(null)
    } finally { setSaving(false) }
  }

  const arkhitxPrompts = prompts.filter(p => p.application_slug === 'arkhitx-framework' || p.id.startsWith('arkhitx-'))
  const appPrompts = prompts.filter(p => p.application_slug !== 'arkhitx-framework' && !p.id.startsWith('arkhitx-'))

  // Group application agents by their application_slug
  const appGroups: Record<string, AgentPrompt[]> = {}
  for (const p of appPrompts) {
    const key = p.application_slug ?? 'unknown'
    if (!appGroups[key]) appGroups[key] = []
    appGroups[key].push(p)
  }

  // Which application groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const toggleGroup = (slug: string) =>
    setCollapsedGroups(prev => ({ ...prev, [slug]: !prev[slug] }))

  const slugToName = (slug: string) =>
    slug === 'unknown'
      ? 'Unassigned'
      : slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

  const renderGroup = (title: string, items: AgentPrompt[], badge?: string) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h2>
        {badge && <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">{badge}</span>}
      </div>
      <div className="space-y-3">
        {items.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{p.agent_name}</h3>
                  <span className="text-xs text-gray-400 font-mono">{p.id}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Model: <span className="font-mono">{p.model}</span> · Temp: {p.temperature} · Max tokens: {p.max_tokens.toLocaleString()}
                  {p.updated_at && <> · Updated: {fmtDate(p.updated_at)}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {editing === p.id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSave() }}
                    disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); startEdit(p) }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                )}
                {expanded === p.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </div>
            </div>

            {expanded === p.id && (
              <div className="border-t border-gray-100 p-4 bg-gray-50">
                {editing === p.id ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Model</label>
                        <input
                          value={editData.model || ''}
                          onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Temperature</label>
                        <input
                          type="number" step="0.1" min="0" max="1"
                          value={editData.temperature ?? 0}
                          onChange={(e) => setEditData({ ...editData, temperature: parseFloat(e.target.value) })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Max Tokens</label>
                        <input
                          type="number" min="1"
                          value={editData.max_tokens ?? 0}
                          onChange={(e) => setEditData({ ...editData, max_tokens: parseInt(e.target.value) })}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">System Prompt</label>
                      <textarea
                        value={editData.system_prompt || ''}
                        onChange={(e) => setEditData({ ...editData, system_prompt: e.target.value })}
                        rows={10}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {p.description && (
                      <p className="text-sm text-gray-600 mb-3">{p.description}</p>
                    )}
                    <pre className="text-xs text-gray-600 bg-white border border-gray-200 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                      {p.system_prompt}
                    </pre>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-8 max-w-4xl">
      {renderGroup('ArkhitX Framework Agents', arkhitxPrompts, 'self-governed')}

      {/* Application agents grouped by application, each group collapsible */}
      {Object.keys(appGroups).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Application Agents</h2>
          <div className="space-y-4">
            {Object.entries(appGroups).map(([slug, items]) => {
              const isCollapsed = collapsedGroups[slug]
              return (
                <div key={slug} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Group header — click to collapse/expand */}
                  <button
                    onClick={() => toggleGroup(slug)}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isCollapsed
                        ? <ChevronRight className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />
                      }
                      <span className="font-semibold text-gray-800">{slugToName(slug)}</span>
                      <span className="text-xs text-gray-400 font-mono">{slug}</span>
                    </div>
                    <span className="text-xs text-gray-400">{items.length} agent{items.length !== 1 ? 's' : ''}</span>
                  </button>

                  {/* Agents list — hidden when collapsed */}
                  {!isCollapsed && (
                    <div className="divide-y divide-gray-100">
                      {items.map(p => (
                        <div key={p.id} className="bg-white">
                          <div
                            className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50"
                            onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-medium text-gray-900">{p.agent_name}</h3>
                                <span className="text-xs text-gray-400 font-mono">{p.id}</span>
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5">
                                Model: <span className="font-mono">{p.model}</span> · Temp: {p.temperature} · Max tokens: {p.max_tokens.toLocaleString()}
                                {p.updated_at && <> · Updated: {fmtDate(p.updated_at)}</>}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {editing === p.id ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSave() }}
                                  disabled={saving}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                  <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { e.stopPropagation(); startEdit(p) }}
                                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                                >
                                  <Edit3 className="w-4 h-4" /> Edit
                                </button>
                              )}
                              {expanded === p.id
                                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                                : <ChevronRight className="w-4 h-4 text-gray-400" />
                              }
                            </div>
                          </div>

                          {expanded === p.id && (
                            <div className="border-t border-gray-100 px-5 py-4 bg-gray-50">
                              {editing === p.id ? (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-3 gap-3">
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">Model</label>
                                      <input
                                        value={editData.model || ''}
                                        onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">Temperature</label>
                                      <input
                                        type="number" step="0.1" min="0" max="1"
                                        value={editData.temperature ?? 0}
                                        onChange={(e) => setEditData({ ...editData, temperature: parseFloat(e.target.value) })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">Max Tokens</label>
                                      <input
                                        type="number" min="1"
                                        value={editData.max_tokens ?? 0}
                                        onChange={(e) => setEditData({ ...editData, max_tokens: parseInt(e.target.value) })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg"
                                      />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-500 mb-1">System Prompt</label>
                                    <textarea
                                      value={editData.system_prompt || ''}
                                      onChange={(e) => setEditData({ ...editData, system_prompt: e.target.value })}
                                      rows={10}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg font-mono"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {p.description && <p className="text-sm text-gray-600 mb-3">{p.description}</p>}
                                  <pre className="text-xs text-gray-600 bg-white border border-gray-200 p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                                    {p.system_prompt}
                                  </pre>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {prompts.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No agent prompts configured yet</p>
          <p className="text-sm mt-1">Prompts are seeded as projects are registered</p>
        </div>
      )}
    </div>
  )
}

// ─── Database Tab ─────────────────────────────────────────────────────────────
function DatabaseTab() {
  const [activeTable, setActiveTable] = useState<DbTable>('apps')
  const [apps, setApps] = useState<AppEntry[]>([])
  const [prompts, setPrompts] = useState<AgentPrompt[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [grounding, setGrounding] = useState<GroundingRecord[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (t: DbTable) => {
    setLoading(true)
    try {
      if (t === 'apps') {
        const { data } = await applicationsApi.list()
        setApps(data)
      } else if (t === 'prompts') {
        const { data } = await governanceApi.listPrompts()
        setPrompts(data)
      } else if (t === 'audit_logs') {
        const { data } = await governanceApi.auditLogs({ limit: 100 })
        setAuditLogs(data)
      } else if (t === 'grounding') {
        const { data } = await governanceApi.groundingRecords()
        setGrounding(data)
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(activeTable) }, [activeTable, load])

  const tables: { key: DbTable; label: string; description: string }[] = [
    { key: 'apps', label: 'Registered Apps', description: 'Projects registered with ArkhitX' },
    { key: 'prompts', label: 'Agent Prompts', description: 'LLM configs stored in governance DB' },
    { key: 'audit_logs', label: 'Audit Logs', description: 'All LLM calls and agent events' },
    { key: 'grounding', label: 'Grounding Records', description: 'Knowledge graph context scores' },
  ]

  const counts: Record<DbTable, number> = {
    apps: apps.length,
    prompts: prompts.length,
    audit_logs: auditLogs.length,
    grounding: grounding.length,
  }

  return (
    <div className="flex h-full min-h-0" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Sidebar */}
      <div className="w-56 border-r border-gray-200 p-4 space-y-1 flex-shrink-0">
        {tables.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTable(t.key)}
            className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${activeTable === t.key ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t.label}</span>
              {counts[t.key] > 0 && (
                <span className="text-xs text-gray-400">{counts[t.key]}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5 leading-tight">{t.description}</p>
          </button>
        ))}
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{tables.find(t => t.key === activeTable)?.label}</h2>
          <button onClick={() => load(activeTable)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-400">
            <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
            Loading…
          </div>
        )}

        {!loading && activeTable === 'apps' && (
          <TableView
            columns={['Name', 'Slug', 'Phase', 'On Disk', 'Project ID']}
            rows={apps.map(a => [
              a.name,
              <span className="font-mono text-xs">{a.slug}</span>,
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Phase {a.phase}</span>,
              a.on_disk
                ? <CheckCircle className="w-4 h-4 text-green-500" />
                : <AlertTriangle className="w-4 h-4 text-amber-400" />,
              <span className="font-mono text-xs text-gray-400">{a.project_id ?? '—'}</span>,
            ])}
          />
        )}

        {!loading && activeTable === 'prompts' && (
          <TableView
            columns={['Agent Name', 'ID', 'Model', 'Temp', 'Max Tokens', 'Updated']}
            rows={prompts.map(p => [
              p.agent_name,
              <span className="font-mono text-xs text-gray-500">{p.id}</span>,
              <span className="font-mono text-xs">{p.model}</span>,
              p.temperature,
              p.max_tokens.toLocaleString(),
              <span className="text-xs text-gray-400">{fmtDate(p.updated_at)}</span>,
            ])}
          />
        )}

        {!loading && activeTable === 'audit_logs' && (
          <TableView
            columns={['Timestamp', 'Actor', 'Action', 'Entity Type', 'Project']}
            rows={auditLogs.map(l => [
              <span className="text-xs text-gray-500">{fmtDate(l.created_at)}</span>,
              <span className="font-mono text-xs">{l.actor}</span>,
              <span className="font-mono text-xs text-indigo-600">{l.action}</span>,
              <span className="text-xs text-gray-500">{l.entity_type ?? '—'}</span>,
              <span className="font-mono text-xs text-gray-400">{l.project_id?.slice(0, 8) ?? '—'}</span>,
            ])}
          />
        )}

        {!loading && activeTable === 'grounding' && (
          <TableView
            columns={['Timestamp', 'Agent', 'Score', 'Nodes', 'Project']}
            rows={grounding.map(g => [
              <span className="text-xs text-gray-500">{fmtDate(g.created_at)}</span>,
              <span className="font-mono text-xs">{g.agent_name}</span>,
              <Score v={g.grounding_score} />,
              g.node_count,
              <span className="font-mono text-xs text-gray-400">{g.project_id?.slice(0, 8) ?? '—'}</span>,
            ])}
          />
        )}
      </div>
    </div>
  )
}

function TableView({ columns, rows }: { columns: (string | React.ReactNode)[]; rows: (string | number | React.ReactNode)[][] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Table2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No records found</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((c, i) => (
              <th key={i} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
              {row.map((cell, ci) => (
                <td key={ci} className="py-2 px-3 text-gray-700">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Phase Gate result renderer ───────────────────────────────────────────────
function PhaseGateResult({ data }: { data: Record<string, unknown> }) {
  const canAdvance = data.can_advance as boolean
  const passed = (data.gates_passed as string[]) ?? []
  const failed = (data.gates_failed as string[]) ?? []
  const action = data.action_required as string

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 font-semibold text-sm ${canAdvance ? 'text-green-700' : 'text-red-600'}`}>
        {canAdvance
          ? <><CheckCircle className="w-5 h-5" /> Gate passed — ready to advance to Phase {data.target_phase as number}</>
          : <><XCircle className="w-5 h-5" /> Gate blocked — {failed.length} condition{failed.length !== 1 ? 's' : ''} not met</>
        }
      </div>
      {passed.length > 0 && (
        <div className="space-y-1">
          {passed.map((g, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-green-700">
              <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{g}</span>
            </div>
          ))}
        </div>
      )}
      {failed.length > 0 && (
        <div className="space-y-1">
          {failed.map((g, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-red-600">
              <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{g}</span>
            </div>
          ))}
        </div>
      )}
      {action && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">What to do:</p>
          <p>{action}</p>
        </div>
      )}
    </div>
  )
}

// ─── Compliance Checker result renderer ───────────────────────────────────────
function ComplianceResult({ data }: { data: Record<string, unknown> }) {
  const compliant = data.overall_compliant as boolean
  const rules = (data.rule_results as { rule_id: string; status: string; reason: string }[]) ?? []
  const recommendation = data.recommendation as string
  const score = data.grounding_score as number | undefined

  const statusColor = (s: string) => ({
    COMPLIANT:       'text-green-700 bg-green-50',
    VIOLATED:        'text-red-600 bg-red-50',
    NOT_APPLICABLE:  'text-gray-400 bg-gray-50',
  }[s] ?? 'text-gray-600 bg-gray-50')

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2 font-semibold text-sm ${compliant ? 'text-green-700' : 'text-red-600'}`}>
        {compliant
          ? <><CheckCircle className="w-5 h-5" /> Output is compliant</>
          : <><XCircle className="w-5 h-5" /> Violations detected</>
        }
        {score !== undefined && (
          <span className="ml-auto font-mono text-xs text-gray-500">Grounding: {Math.round(score * 100)}%</span>
        )}
      </div>
      <div className="space-y-1.5">
        {rules.map(r => (
          <div key={r.rule_id} className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${statusColor(r.status)}`}>
            <span className="font-mono font-semibold flex-shrink-0">{r.rule_id}</span>
            <span className="font-semibold flex-shrink-0">{r.status}</span>
            <span className="text-gray-600">{r.reason}</span>
          </div>
        ))}
      </div>
      {recommendation && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          <p className="font-semibold mb-1">Recommendation:</p>
          <p>{recommendation}</p>
        </div>
      )}
    </div>
  )
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────
function AgentsTab() {
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

  useEffect(() => { load() }, [load])

  const setExtra = (agentId: string, key: string, val: string) =>
    setExtraInputs(prev => ({
      ...prev,
      [agentId]: { ...(prev[agentId] ?? {}), [key]: val },
    }))

  const runAgent = async (agent: AgentDef) => {
    const slug = selectedSlug[agent.id] ?? ''
    if (agent.requiresSlug && !slug) return

    const extra = extraInputs[agent.id] ?? {}

    setRunning(agent.id)
    setResults(prev => ({ ...prev, [agent.id]: null }))
    try {
      const { data } = await agent.trigger(slug, extra)
      setResults(prev => ({ ...prev, [agent.id]: data }))
      load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setResults(prev => ({ ...prev, [agent.id]: { error: msg } }))
    } finally {
      setRunning(null)
    }
  }

  const agentLogs = (agentId: string) =>
    recentLogs.filter(l => l.actor.includes(agentId.replace('arkhitx-', '')))

  const canRun = (agent: AgentDef) => {
    if (agent.requiresSlug && !selectedSlug[agent.id]) return false
    const extra = extraInputs[agent.id] ?? {}
    if (agent.extraFields) {
      const required = agent.extraFields.filter(f => !f.placeholder?.includes('optional'))
      return required.every(f => !!extra[f.key])
    }
    return true
  }

  const renderResult = (agentId: string, data: unknown) => {
    if (!data) return null
    const obj = data as Record<string, unknown>

    if (obj.error) {
      return (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {String(obj.error)}
        </div>
      )
    }
    if (agentId === 'arkhitx-phase-gate-validator') return <PhaseGateResult data={obj} />
    if (agentId === 'arkhitx-compliance-checker') return <ComplianceResult data={obj} />

    return (
      <pre className="text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap">
        {JSON.stringify(data, null, 2)}
      </pre>
    )
  }

  return (
    <div className="p-8 max-w-4xl space-y-6">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800">
        <strong>ArkhitX Internal Agents</strong> — All 6 agents are self-governed: they log to ArkhitX's own audit trail and ground against the GovernanceRule / ProjectPhase knowledge graph.
      </div>

      {ARKHITX_AGENTS.map(agent => {
        const logs = agentLogs(agent.id)
        const result = results[agent.id]
        const isRunning = running === agent.id
        const slug = selectedSlug[agent.id] ?? ''
        const extra = extraInputs[agent.id] ?? {}
        const ready = canRun(agent) && !isRunning

        return (
          <div key={agent.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header row */}
            <div className="p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">{agent.icon}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5 max-w-xl">{agent.description}</p>
                    <p className="text-xs text-gray-400 font-mono mt-1">{agent.id}</p>
                  </div>
                </div>
                <button
                  onClick={() => runAgent(agent)}
                  disabled={!ready}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {isRunning
                    ? <><RefreshCw className="w-4 h-4 animate-spin" /> Running…</>
                    : <><Play className="w-4 h-4" /> Run</>
                  }
                </button>
              </div>

              {/* Inputs */}
              <div className="space-y-3">
                {agent.requiresSlug && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Application</label>
                    <select
                      value={slug}
                      onChange={e => setSelectedSlug(prev => ({ ...prev, [agent.id]: e.target.value }))}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 w-full max-w-xs"
                    >
                      <option value="">Select app…</option>
                      {apps.map(a => (
                        <option key={a.slug} value={a.slug}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {agent.extraFields?.map(field => (
                  <div key={field.key}>
                    <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={extra[field.key] ?? ''}
                        onChange={e => setExtra(agent.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        rows={4}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-y"
                      />
                    ) : field.type === 'select' ? (
                      <select
                        value={extra[field.key] ?? ''}
                        onChange={e => setExtra(agent.id, field.key, e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 w-full max-w-xs"
                      >
                        <option value="">Select…</option>
                        {field.options?.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={extra[field.key] ?? ''}
                        onChange={e => setExtra(agent.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Result */}
            {result !== undefined && result !== null && (
              <div className="px-5 pb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Result</p>
                {renderResult(agent.id, result)}
              </div>
            )}

            {/* Recent calls */}
            {logs.length > 0 && (
              <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Recent Calls ({logs.length})
                </p>
                <div className="space-y-1">
                  {logs.slice(0, 4).map(log => (
                    <div key={log.id} className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="w-3 h-3 flex-shrink-0 text-gray-300" />
                      <span>{fmtDate(log.created_at)}</span>
                      <span className="text-gray-300">·</span>
                      <span className="font-mono text-indigo-600">{log.action}</span>
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

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function ToolsPage() {
  const [tab, setTab] = useState<Tab>('prompts')

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'prompts', label: 'Agent Prompts', icon: <FileText className="w-4 h-4" /> },
    { key: 'database', label: 'Database', icon: <Database className="w-4 h-4" /> },
    { key: 'agents', label: 'Agents', icon: <Bot className="w-4 h-4" /> },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-8 pt-6 pb-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Tools</h1>
        <p className="text-sm text-gray-400 mb-4">Manage prompts, inspect governance data, and run ArkhitX agents</p>
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'prompts' && <PromptsTab />}
        {tab === 'database' && <DatabaseTab />}
        {tab === 'agents' && <AgentsTab />}
      </div>
    </div>
  )
}
