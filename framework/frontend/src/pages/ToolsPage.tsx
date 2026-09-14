import { useState, useCallback, useEffect } from 'react'
import { governanceApi } from '../lib/api'
import { AgentPrompt } from '../types'
import { TabBar } from '../components/ui/TabBar'
import { PageHeader } from '../components/ui/PageHeader'
import { GovernanceDataTab } from '../components/tools/GovernanceDataTab'
import { FrameworkAgentsTab } from '../components/tools/FrameworkAgentsTab'
import {
  Save, Edit3, Database, Bot, FileText,
  ChevronRight, ChevronDown, Wrench,
} from 'lucide-react'

type Tab = 'prompts' | 'governance-data' | 'agents'

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString()
}

function PromptsTab() {
  const [prompts, setPrompts] = useState<AgentPrompt[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<AgentPrompt>>({})
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    governanceApi.listPrompts().then(({ data }) => setPrompts(data))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const startEdit = (p: AgentPrompt) => {
    setEditing(p.id)
    setExpanded(p.id)
    setEditData({
      system_prompt: p.system_prompt,
      model: p.model,
      temperature: p.temperature,
      max_tokens: p.max_tokens,
    })
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await governanceApi.updatePrompt(editing, editData)
      load()
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  const arkhitxPrompts = prompts.filter(
    (p) => p.application_slug === 'arkhitx-framework' || p.id.startsWith('arkhitx-'),
  )
  const appPrompts = prompts.filter(
    (p) => p.application_slug !== 'arkhitx-framework' && !p.id.startsWith('arkhitx-'),
  )

  const appGroups: Record<string, AgentPrompt[]> = {}
  for (const p of appPrompts) {
    const key = p.application_slug ?? 'unknown'
    if (!appGroups[key]) appGroups[key] = []
    appGroups[key].push(p)
  }

  const toggleGroup = (slug: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [slug]: !prev[slug] }))

  const slugToName = (slug: string) =>
    slug === 'unknown'
      ? 'Unassigned'
      : slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

  const renderPromptCard = (p: AgentPrompt, compact = false) => (
    <div key={p.id} className={compact ? 'bg-ax-bg-2' : 'ax-panel overflow-hidden'}>
      <div
        className={`flex items-center justify-between cursor-pointer hover:bg-ax-bg-3 ${compact ? 'px-5 py-3' : 'p-4'}`}
        onClick={() => setExpanded(expanded === p.id ? null : p.id)}
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-ax-text ${compact ? 'font-medium' : ''}`}>{p.agent_name}</h3>
            <span className="text-xs text-ax-text-muted font-mono">{p.id}</span>
          </div>
          <p className="text-xs text-ax-text-muted mt-0.5">
            Model: <span className="font-mono">{p.model}</span> · Temp: {p.temperature} · Max tokens:{' '}
            {p.max_tokens.toLocaleString()}
            {p.updated_at && <> · Updated: {fmtDate(p.updated_at)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {editing === p.id ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void handleSave()
              }}
              disabled={saving}
              className="ax-btn-success flex items-center gap-1 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                startEdit(p)
              }}
              className="ax-btn-secondary flex items-center gap-1 px-3 py-1.5 text-sm"
            >
              <Edit3 className="w-4 h-4" /> Edit
            </button>
          )}
          {expanded === p.id ? (
            <ChevronDown className="w-4 h-4 text-ax-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-ax-text-muted" />
          )}
        </div>
      </div>

      {expanded === p.id && (
        <div className={`border-t border-ax-border/60 bg-ax-bg-3 ${compact ? 'px-5 py-4' : 'p-4'}`}>
          {editing === p.id ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="ax-label">Model</label>
                  <input
                    value={editData.model || ''}
                    onChange={(e) => setEditData({ ...editData, model: e.target.value })}
                    className="ax-input"
                  />
                </div>
                <div>
                  <label className="ax-label">Temperature</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="1"
                    value={editData.temperature ?? 0}
                    onChange={(e) => setEditData({ ...editData, temperature: parseFloat(e.target.value) })}
                    className="ax-input"
                  />
                </div>
                <div>
                  <label className="ax-label">Max Tokens</label>
                  <input
                    type="number"
                    min="1"
                    value={editData.max_tokens ?? 0}
                    onChange={(e) => setEditData({ ...editData, max_tokens: parseInt(e.target.value) })}
                    className="ax-input"
                  />
                </div>
              </div>
              <div>
                <label className="ax-label">System Prompt</label>
                <textarea
                  value={editData.system_prompt || ''}
                  onChange={(e) => setEditData({ ...editData, system_prompt: e.target.value })}
                  rows={10}
                  className="ax-textarea font-mono"
                />
              </div>
            </div>
          ) : (
            <>
              {p.description && <p className="text-sm text-ax-text-dim mb-3">{p.description}</p>}
              <pre className="text-xs text-ax-text-dim bg-ax-bg-2 border border-ax-border p-3 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap">
                {p.system_prompt}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <div className="ax-alert-info text-xs">
        Primary prompt editing lives in <strong>Tools → Governance Data → agent_prompts</strong>. Quick edit below
        for convenience.
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-ax-text-muted uppercase tracking-wider">ArkhitX Framework Agents</h2>
          <span className="px-2 py-0.5 bg-ax-primary/20 text-ax-primary-light text-xs rounded-full">self-governed</span>
        </div>
        <div className="space-y-3">{arkhitxPrompts.map((p) => renderPromptCard(p))}</div>
      </div>

      {Object.keys(appGroups).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ax-text-muted uppercase tracking-wider mb-3">Application Agents</h2>
          <div className="space-y-4">
            {Object.entries(appGroups).map(([slug, items]) => {
              const isCollapsed = collapsedGroups[slug]
              return (
                <div key={slug} className="border border-ax-border rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleGroup(slug)}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-ax-bg-3 hover:bg-ax-bg-hover transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-ax-text-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-ax-text-muted" />
                      )}
                      <span className="font-semibold text-ax-text">{slugToName(slug)}</span>
                      <span className="text-xs text-ax-text-muted font-mono">{slug}</span>
                    </div>
                    <span className="text-xs text-ax-text-muted">
                      {items.length} agent{items.length !== 1 ? 's' : ''}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="divide-y divide-ax-border/40">{items.map((p) => renderPromptCard(p, true))}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {prompts.length === 0 && (
        <div className="text-center py-16 text-ax-text-muted">
          <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No agent prompts configured yet</p>
          <p className="text-sm mt-1">Prompts are seeded as projects are registered</p>
        </div>
      )}
    </div>
  )
}

export default function ToolsPage() {
  const [tab, setTab] = useState<Tab>('governance-data')

  const tabs = [
    { key: 'governance-data' as const, label: 'Governance Data', icon: Database },
    { key: 'prompts' as const, label: 'Agent Prompts', icon: FileText },
    { key: 'agents' as const, label: 'Agents', icon: Bot },
  ]

  return (
    <div className="ax-page">
      <PageHeader
        icon={Wrench}
        title="Tools"
        subtitle="Governance data console, prompt management, and ArkhitX agents"
      >
        <TabBar tabs={tabs} active={tab} onChange={setTab} className="mt-2" />
      </PageHeader>

      <div className="ax-page-body">
        {tab === 'governance-data' && <GovernanceDataTab />}
        {tab === 'prompts' && <PromptsTab />}
        {tab === 'agents' && <FrameworkAgentsTab />}
      </div>
    </div>
  )
}
