import { useEffect, useState, useMemo, useCallback } from 'react'
import { governanceApi, applicationsApi } from '../lib/api'
import { AuditLogEntry, GroundingRecord } from '../types'
import {
  Shield, Activity, Database, Info, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Clock, Download,
} from 'lucide-react'

type Tab = 'audit' | 'grounding' | 'pipeline'
type QuickFilter = 'all' | 'errors' | 'llm'

interface AppMeta {
  slug: string
  name: string
  project_id: string | null
  current_phase: 0 | 1 | 2 | 3
  phases: {
    build: { ready: boolean; ontology_present: boolean; prompts_present: boolean; seed_present: boolean }
    register: { complete: boolean; project_id: string | null }
    seed: { complete: boolean; events: number }
    govern: { audit_logs: number; grounding_records: number }
  }
}

/* ── Tab metadata ──────────────────────────────────────────────────────────── */
const TAB_META: Record<Tab, { label: string; icon: React.ElementType; summary: string; explanation: string }> = {
  audit: {
    label: 'Audit Log', icon: Shield,
    summary: 'Every agent LLM call, recorded.',
    explanation: 'Every time a governed agent calls the LLM, ArkhitX records who called it, what action was taken, and the context passed in. This is your tamper-evident trail — proof of exactly what each AI agent did, when it did it, and why.',
  },
  grounding: {
    label: 'Grounding', icon: Activity,
    summary: 'How much each agent response was anchored to real knowledge graph data.',
    explanation: 'Before calling the LLM, a governed agent queries the Neo4j knowledge graph for relevant reference data. The grounding score (0.0–1.0) measures how much of the agent\'s response referenced those graph nodes. A high score means fact-anchored; a low score means the agent had no graph context (by design, for extraction agents).',
  },
  pipeline: {
    label: 'Pipeline', icon: Database,
    summary: 'Phase-by-phase governance progress for each application.',
    explanation: 'Shows the full ArkhitX governance journey for each application across all 4 phases: Build (standalone app), Register (project & prompts stored), Seed (knowledge graph populated), and Govern (agents actively logging audit + grounding). Click any phase section to expand it.',
  },
}

const APP_COLORS = [
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-pink-100 text-pink-700 border-pink-200',
]
const APP_DOT_COLORS = ['bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500']

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function AppBadge({ name, colorIdx }: { name: string; colorIdx: number }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${APP_COLORS[colorIdx % APP_COLORS.length]}`}>
      {name}
    </span>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-xs">—</span>
  const cls = score >= 0.7 ? 'bg-green-100 text-green-700' : score >= 0.4 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{score.toFixed(2)}</span>
}

function ExplanationBanner({ tab }: { tab: Tab }) {
  const [open, setOpen] = useState(false)
  const meta = TAB_META[tab]
  return (
    <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 text-sm overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-100 transition-colors">
        <Info className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="font-medium text-blue-800">{meta.summary}</span>
        <ChevronDown className={`w-4 h-4 text-blue-400 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1 text-blue-700 leading-relaxed border-t border-blue-100">{meta.explanation}</div>}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Main page                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
export default function GovernancePage() {
  const [tab, setTab] = useState<Tab>('pipeline')
  const [apps, setApps] = useState<AppMeta[]>([])
  const [selectedSlug, setSelectedSlug] = useState<string>('all')

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [groundingRecords, setGroundingRecords] = useState<GroundingRecord[]>([])
  // Pipeline tab uses its own combined data
  const [pipelineLogs, setPipelineLogs] = useState<AuditLogEntry[]>([])
  const [pipelineGrounding, setPipelineGrounding] = useState<GroundingRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [promptNameMap, setPromptNameMap] = useState<Record<string, string>>({})

  useEffect(() => {
    applicationsApi.list()
      .then(({ data }) => setApps((data as AppMeta[]).filter(a => a.project_id || a.current_phase >= 0)))
      .catch(() => {})
    // Load all agent prompts once so we can display friendly agent names
    governanceApi.listPrompts()
      .then(({ data }) => {
        const m: Record<string, string> = {}
        for (const p of (data as { id: string; agent_name: string }[])) m[p.id] = p.agent_name
        setPromptNameMap(m)
      })
      .catch(() => {})
  }, [])

  const appByProjectId = useMemo(() => {
    const m: Record<string, { name: string; slug: string; colorIdx: number }> = {}
    apps.forEach((a, i) => { if (a.project_id) m[a.project_id] = { name: a.name, slug: a.slug, colorIdx: i } })
    return m
  }, [apps])

  const selectedProjectId = useMemo(() =>
    selectedSlug === 'all' ? undefined : apps.find(a => a.slug === selectedSlug)?.project_id ?? undefined,
    [selectedSlug, apps])

  const sort = <T extends { created_at: string | null }>(arr: T[]) =>
    [...arr].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))

  useEffect(() => {
    setLoading(true)
    const params = selectedProjectId ? { project_id: selectedProjectId } : {}

    if (tab === 'audit') {
      governanceApi.auditLogs({ ...params, limit: 200 })
        .then(({ data }) => setAuditLogs(sort(data)))
        .finally(() => setLoading(false))
    } else if (tab === 'grounding') {
      governanceApi.groundingRecords({ ...params, limit: 200 })
        .then(({ data }) => setGroundingRecords(sort(data)))
        .finally(() => setLoading(false))
    } else {
      // Pipeline: load both audit logs AND grounding for the rich view
      Promise.all([
        governanceApi.auditLogs({ ...params, limit: 500 }),
        governanceApi.groundingRecords({ ...params, limit: 500 }),
      ]).then(([a, g]) => {
        setPipelineLogs(sort(a.data as AuditLogEntry[]))
        setPipelineGrounding(sort(g.data as GroundingRecord[]))
      }).finally(() => setLoading(false))
    }
  }, [tab, selectedProjectId])

  const appName = useCallback((pid: string | null) =>
    pid ? appByProjectId[pid] ?? null : null, [appByProjectId])

  const registeredApps = apps.filter(a => a.project_id)

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Governance Dashboard</h1>
        <p className="text-gray-500 mt-1">Real-time audit trail, grounding scores, and pipeline events across all governed applications.</p>
      </div>

      {/* Application filter */}
      <div className="mb-5 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">Application</span>
        <button onClick={() => setSelectedSlug('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            selectedSlug === 'all' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}>
          All Applications
        </button>
        {apps.map((app, i) => (
          <button key={app.slug} onClick={() => setSelectedSlug(app.slug)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              selectedSlug === app.slug
                ? `${APP_COLORS[i % APP_COLORS.length]}`
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>
            {app.name}
          </button>
        ))}
        {apps.length === 0 && <span className="text-xs text-gray-400 italic">No applications found.</span>}
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {(Object.entries(TAB_META) as [Tab, typeof TAB_META[Tab]][]).map(([key, meta]) => {
          const Icon = meta.icon
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="w-4 h-4" />{meta.label}
            </button>
          )
        })}
      </div>

      <ExplanationBanner tab={tab} key={tab} />

      {loading && <div className="text-center py-12 text-gray-400 text-sm">Loading…</div>}

      {!loading && tab === 'audit'     && <AuditTable logs={auditLogs} appName={appName} />}
      {!loading && tab === 'grounding' && <GroundingTable records={groundingRecords} appName={appName} />}
      {!loading && tab === 'pipeline'  && (
        <PipelineView
          apps={apps}
          registeredApps={registeredApps}
          selectedSlug={selectedSlug}
          onSelectApp={setSelectedSlug}
          logs={pipelineLogs}
          grounding={pipelineGrounding}
          appByProjectId={appByProjectId}
          promptNameMap={promptNameMap}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  PIPELINE VIEW                                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

const PHASE_META = [
  { phase: 0, label: 'Build',    emoji: '🔨', desc: 'Standalone app running — governance files present' },
  { phase: 1, label: 'Register', emoji: '📋', desc: 'Project & agent prompts registered with ArkhitX' },
  { phase: 2, label: 'Seed',     emoji: '🌐', desc: 'Knowledge graph populated with reference data' },
  { phase: 3, label: 'Govern',   emoji: '🛡️', desc: 'Agents actively logging audit + grounding' },
]

interface PipelineViewProps {
  apps: AppMeta[]
  registeredApps: AppMeta[]
  selectedSlug: string
  onSelectApp: (s: string) => void
  logs: AuditLogEntry[]
  grounding: GroundingRecord[]
  appByProjectId: Record<string, { name: string; slug: string; colorIdx: number }>
  promptNameMap: Record<string, string>
}

function PipelineView({ apps, registeredApps, selectedSlug, onSelectApp, logs, grounding, appByProjectId, promptNameMap }: PipelineViewProps) {
  if (selectedSlug === 'all') {
    return <PipelineAllApps apps={apps} onSelectApp={onSelectApp} logs={logs} grounding={grounding} appByProjectId={appByProjectId} />
  }
  const app = apps.find(a => a.slug === selectedSlug)
  if (!app) return <div className="text-gray-400 text-sm py-8 text-center">Application not found.</div>
  const colorIdx = apps.findIndex(a => a.slug === selectedSlug)
  return <AppPipelineDetail app={app} colorIdx={colorIdx} logs={logs} grounding={grounding} promptNameMap={promptNameMap} />
}

/* ── All-apps summary grid ─────────────────────────────────────────────────── */
function PipelineAllApps({ apps, onSelectApp, logs, grounding, appByProjectId }: {
  apps: AppMeta[]
  onSelectApp: (s: string) => void
  logs: AuditLogEntry[]
  grounding: GroundingRecord[]
  appByProjectId: Record<string, { name: string; slug: string; colorIdx: number }>
}) {
  // Compute totals per app
  const statsByApp = useMemo(() => {
    const m: Record<string, { calls: number; avgGrounding: number | null }> = {}
    for (const app of apps) {
      if (!app.project_id) continue
      const appLogs = logs.filter(l => l.project_id === app.project_id && l.action === 'llm_call')
      const appGrounding = grounding.filter(g => g.project_id === app.project_id)
      const scores = appGrounding.map(g => g.grounding_score).filter(s => s !== null) as number[]
      m[app.slug] = {
        calls: appLogs.length,
        avgGrounding: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
      }
    }
    return m
  }, [apps, logs, grounding])

  return (
    <div className="space-y-3">
      {/* Summary header row */}
      <div className="grid grid-cols-4 gap-3 mb-2 px-4 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
        <span>Application</span>
        <span className="text-center">Phase Progress</span>
        <span className="text-center">LLM Calls</span>
        <span className="text-center">Avg Grounding</span>
      </div>

      {apps.map((app, i) => {
        const stats = statsByApp[app.slug] ?? { calls: 0, avgGrounding: null }
        const phase = app.current_phase
        return (
          <div key={app.slug}
            className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
            onClick={() => onSelectApp(app.slug)}>
            <div className="grid grid-cols-4 gap-3 items-center px-4 py-3">
              {/* App name */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${APP_DOT_COLORS[i % APP_DOT_COLORS.length]}`} />
                <div>
                  <div className="font-semibold text-sm text-gray-900">{app.name}</div>
                  <div className="text-xs text-gray-400 font-mono">{app.slug}</div>
                </div>
              </div>

              {/* Phase progress */}
              <div className="flex items-center justify-center gap-1">
                {PHASE_META.map(({ phase: p, emoji }) => (
                  <div key={p} className="flex flex-col items-center gap-0.5">
                    <span className={`text-sm ${p <= phase ? 'opacity-100' : 'opacity-20'}`}>{emoji}</span>
                    <span className={`w-4 h-0.5 rounded ${p < phase ? 'bg-green-400' : p === phase ? 'bg-blue-400' : 'bg-gray-200'}`} />
                  </div>
                ))}
                <span className="ml-2 text-xs font-medium text-gray-500">Phase {phase}</span>
              </div>

              {/* LLM calls */}
              <div className="text-center">
                <div className="text-lg font-bold text-gray-800">{stats.calls}</div>
                <div className="text-[10px] text-gray-400">agent calls</div>
              </div>

              {/* Avg grounding */}
              <div className="flex justify-center">
                {stats.avgGrounding !== null
                  ? <ScoreBadge score={stats.avgGrounding} />
                  : <span className="text-xs text-gray-400">—</span>}
              </div>
            </div>

            {/* Phase strip */}
            <div className="border-t border-gray-100 px-4 py-2 grid grid-cols-4 gap-2">
              {PHASE_META.map(({ phase: p, label }) => {
                const done = p < phase
                const current = p === phase
                return (
                  <div key={p} className={`flex items-center gap-1.5 text-xs rounded px-2 py-1 ${
                    done ? 'bg-green-50 text-green-700' : current ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'
                  }`}>
                    {done ? <CheckCircle2 className="w-3 h-3" /> : current ? <Clock className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current opacity-40" />}
                    <span className="font-medium">{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {apps.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No applications found. Add applications to projects.json to see them here.
        </div>
      )}
    </div>
  )
}

/* ── Single-app detailed pipeline ──────────────────────────────────────────── */
function AppPipelineDetail({ app, colorIdx, logs, grounding, promptNameMap }: {
  app: AppMeta
  colorIdx: number
  logs: AuditLogEntry[]
  grounding: GroundingRecord[]
  promptNameMap: Record<string, string>
}) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const toggle = (p: number) => setCollapsed(prev => {
    const next = new Set(prev); next.has(p) ? next.delete(p) : next.add(p); return next
  })

  // Partition logs by action
  const regEvent    = logs.find(l => l.action === 'project_registered')
  const seedEvent   = logs.find(l => l.action === 'graph_seeded')
  const llmLogs     = logs.filter(l => l.action === 'llm_call')

  // Stats header
  const totalCalls = llmLogs.length
  const scores = grounding.map(g => g.grounding_score).filter(s => s !== null) as number[]
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Top stats bar */}
      <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${APP_DOT_COLORS[colorIdx % APP_DOT_COLORS.length]}`} />
          <span className="font-bold text-gray-700">{app.name}</span>
          <span className="text-gray-400 font-mono">({app.slug})</span>
        </div>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">Current: <strong className="text-gray-700">Phase {app.current_phase} — {PHASE_META[app.current_phase]?.label}</strong></span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">LLM calls: <strong className="text-gray-700">{totalCalls}</strong></span>
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">Avg grounding: </span>
        <ScoreBadge score={avgScore} />
        <span className="text-gray-300">|</span>
        <span className="text-gray-500">Grounding records: <strong className="text-gray-700">{grounding.length}</strong></span>
      </div>

      {/* Phase sections */}
      <div className="divide-y divide-gray-100">
        <PhaseSection phase={0} app={app} collapsed={collapsed.has(0)} onToggle={() => toggle(0)}>
          <BuildSteps app={app} />
        </PhaseSection>

        <PhaseSection phase={1} app={app} collapsed={collapsed.has(1)} onToggle={() => toggle(1)}>
          <EventStep event={regEvent} emptyMsg="Not registered yet. Use the Applications page to register." />
        </PhaseSection>

        <PhaseSection phase={2} app={app} collapsed={collapsed.has(2)} onToggle={() => toggle(2)}>
          <SeedStep event={seedEvent} />
        </PhaseSection>

        <PhaseSection phase={3} app={app} collapsed={collapsed.has(3)} onToggle={() => toggle(3)}>
          <GovernStep logs={llmLogs} grounding={grounding} promptNameMap={promptNameMap} />
        </PhaseSection>
      </div>
    </div>
  )
}

/* ── Phase section wrapper ─────────────────────────────────────────────────── */
function PhaseSection({ phase, app, collapsed, onToggle, children }: {
  phase: number; app: AppMeta; collapsed: boolean; onToggle: () => void; children: React.ReactNode
}) {
  const meta = PHASE_META[phase]
  const isDone    = app.current_phase > phase
  const isCurrent = app.current_phase === phase
  const isFuture  = app.current_phase < phase

  const phaseStepCounts = [
    4, // build: 4 file checks
    1, // register: 1 event
    1, // seed: 1 event
    app.phases.govern.audit_logs, // govern: # of LLM calls
  ]

  return (
    <>
      {/* Phase header row */}
      <button onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
          isDone ? 'bg-green-50/60' : isCurrent ? 'bg-blue-50/60' : 'bg-gray-50/40'
        }`}>
        {collapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        <span className="text-base">{meta.emoji}</span>
        <span className={`text-sm font-bold uppercase tracking-wide ${
          isDone ? 'text-green-700' : isCurrent ? 'text-blue-700' : 'text-gray-400'
        }`}>
          Phase {phase}: {meta.label}
        </span>
        <span className={`text-xs ${isDone ? 'text-green-600' : isCurrent ? 'text-blue-600' : 'text-gray-400'}`}>
          — {meta.desc}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isDone && <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">✓ Complete</span>}
          {isCurrent && <span className="text-xs font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">● Current</span>}
          {isFuture && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Pending</span>}
          {phaseStepCounts[phase] > 0 && (
            <span className="text-xs text-gray-400 tabular-nums">{phaseStepCounts[phase]} {phase === 3 ? 'calls' : 'steps'}</span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="bg-white">
          {children}
        </div>
      )}
    </>
  )
}

/* ── Phase 0: Build steps ──────────────────────────────────────────────────── */
function BuildSteps({ app }: { app: AppMeta }) {
  const steps = [
    { label: 'App folder exists on disk',             ok: app.phases.build.ready !== undefined, tag: 'Manual', desc: 'Project scaffolded with docker-compose.yml, backend, frontend' },
    { label: 'ontology/[slug].json present',          ok: app.phases.build.ontology_present, tag: 'File',   desc: 'Defines entity types and relationships for the knowledge graph' },
    { label: 'governance/prompts.json present',       ok: app.phases.build.prompts_present,  tag: 'File',   desc: 'Agent names, system prompts, model config for Phase 1 registration' },
    { label: 'governance/seed_data.json present',     ok: app.phases.build.seed_present,     tag: 'File',   desc: 'Reference nodes to populate the knowledge graph in Phase 2' },
  ]

  return (
    <StepTable>
      {steps.map((s, i) => (
        <StepRow key={i} step={i + 1} tag={s.tag} label={s.label} desc={s.desc}
          status={s.ok ? 'completed' : 'pending'} time={null} detail={null} />
      ))}
    </StepTable>
  )
}

/* ── Phase 1: Registration event ───────────────────────────────────────────── */
function EventStep({ event, emptyMsg }: { event: AuditLogEntry | undefined; emptyMsg: string }) {
  if (!event) {
    return <div className="px-8 py-4 text-xs text-gray-400 italic">{emptyMsg}</div>
  }
  const ctx = event.context || {}
  const detail = [
    ctx.agents ? `${(ctx.agents as string[]).length} agent prompts seeded` : null,
    ctx.entity_types ? `${(ctx.entity_types as string[]).length} entity types` : null,
    ctx.neo4j_constraints ? `${(ctx.neo4j_constraints as string[]).length} Neo4j constraints` : null,
  ].filter(Boolean).join(' · ')

  return (
    <StepTable>
      <StepRow step={1} tag="Dashboard" label="Project registered with ArkhitX"
        desc="Project row in PostgreSQL, agent prompts seeded, Neo4j constraints created, .env updated"
        status="completed"
        time={event.created_at}
        detail={detail || null} />
    </StepTable>
  )
}

/* ── Phase 2: Graph seed event ─────────────────────────────────────────────── */
function SeedStep({ event }: { event: AuditLogEntry | undefined }) {
  if (!event) {
    return <div className="px-8 py-4 text-xs text-gray-400 italic">Not seeded yet. Use the Applications page to seed the knowledge graph.</div>
  }
  const ctx = event.context || {}
  const detail = [
    ctx.entity_type ? `Type: ${ctx.entity_type}` : null,
    ctx.nodes_seeded != null ? `${ctx.nodes_seeded} nodes seeded` : null,
    ctx.total_in_graph != null ? `${ctx.total_in_graph} total in graph` : null,
  ].filter(Boolean).join(' · ')

  return (
    <StepTable>
      <StepRow step={1} tag="Dashboard" label="Knowledge graph seeded"
        desc="Reference nodes merged into Neo4j — used by agents as grounding context"
        status="completed"
        time={event.created_at}
        detail={detail || null} />
    </StepTable>
  )
}

/* ── Phase 3: Govern — per-agent LLM calls ─────────────────────────────────── */
function GovernStep({ logs, grounding, promptNameMap }: {
  logs: AuditLogEntry[]
  grounding: GroundingRecord[]
  promptNameMap: Record<string, string>
}) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')

  // Resolve actor key (e.g. "agent:contract-risk-agent") → friendly name from DB
  const resolveName = (actor: string): string => {
    const agentId = actor.replace(/^agent:/, '')
    return promptNameMap[agentId] || agentId
  }

  // Group by agent
  const agents = useMemo(() => {
    const m: Record<string, AuditLogEntry[]> = {}
    for (const l of logs) {
      const key = l.actor || 'unknown'
      if (!m[key]) m[key] = []
      m[key].push(l)
    }
    return m
  }, [logs])

  const groundingByAgent = useMemo(() => {
    const m: Record<string, GroundingRecord[]> = {}
    for (const g of grounding) {
      const key = g.agent_name || 'unknown'
      if (!m[key]) m[key] = []
      m[key].push(g)
    }
    return m
  }, [grounding])

  if (logs.length === 0) {
    return (
      <div className="px-8 py-6 text-xs text-gray-400 italic">
        No agent LLM calls yet. Use the application and calls will appear here in real time.
      </div>
    )
  }

  const exportCSV = () => {
    const headers = ['Time', 'Agent', 'Grounding Score', 'Nodes', 'Query Path']
    const rows = grounding.map(g => [
      g.created_at || '', g.agent_name, g.grounding_score?.toFixed(2) || '', g.node_count, g.query_path || '',
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `governance-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50 text-xs">
        <span className="text-gray-500 font-medium">Filter:</span>
        {(['all', 'errors', 'llm'] as QuickFilter[]).map(f => (
          <button key={f} onClick={() => setQuickFilter(f)}
            className={`px-2.5 py-1 rounded transition-colors ${
              quickFilter === f ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}>
            {f === 'all' ? 'All' : f === 'errors' ? 'Errors' : 'LLM Calls'}
          </button>
        ))}
        <button onClick={exportCSV}
          className="ml-auto flex items-center gap-1 text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
          title="Export grounding data as CSV">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>

      {/* Per-agent groups */}
      {Object.entries(agents).map(([agentKey, agentLogs]) => {
        const agentGrounding = groundingByAgent[agentKey] || []
        const scores = agentGrounding.map(g => g.grounding_score).filter(s => s !== null) as number[]
        const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null

        return (
          <div key={agentKey}>
            {/* Agent sub-header */}
            <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50 border-b border-t border-gray-100 text-xs">
              <span className="font-bold text-gray-700">{resolveName(agentKey)}</span>
              <span className="text-gray-400 font-mono">({agentKey.replace(/^agent:/, '')})</span>
              <span className="text-gray-400">{agentLogs.length} {agentLogs.length === 1 ? 'call' : 'calls'}</span>
              {avgScore !== null && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">avg grounding: </span>
                  <ScoreBadge score={avgScore} />
                </>
              )}
              {agentGrounding.length > 0 && agentGrounding[0].query_path && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-400 font-mono truncate max-w-xs" title={agentGrounding[0].query_path}>
                    {agentGrounding[0].query_path.slice(0, 60)}…
                  </span>
                </>
              )}
            </div>

            {/* Call rows */}
            <StepTable>
              {agentLogs.map((log, idx) => {
                const gRecord = agentGrounding.find(g =>
                  g.created_at && log.created_at &&
                  Math.abs(new Date(g.created_at).getTime() - new Date(log.created_at).getTime()) < 5000
                )
                const ctx = log.context || {}
                const elapsed = ctx.elapsed_ms ? `${ctx.elapsed_ms}ms` : null
                const model = ctx.model ? String(ctx.model).replace('claude-', '').slice(0, 20) : null
                const detail = [
                  model ? `model: ${model}` : null,
                  elapsed,
                  gRecord?.node_count ? `${gRecord.node_count} nodes` : null,
                ].filter(Boolean).join(' · ')

                if (quickFilter === 'errors' && !log.context?.error) return null

                return (
                  <StepRow
                    key={log.id}
                    step={agentLogs.length - idx}
                    tag="LLM"
                    label={resolveName(agentKey)}
                    desc={log.action || 'llm_call'}
                    status="completed"
                    time={log.created_at}
                    detail={detail || null}
                    extra={gRecord ? <ScoreBadge score={gRecord.grounding_score ?? null} /> : undefined}
                  />
                )
              })}
            </StepTable>
          </div>
        )
      })}
    </div>
  )
}

/* ── Shared step table + row ───────────────────────────────────────────────── */
function StepTable({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="text-[10px] text-gray-400 uppercase tracking-wider bg-gray-50/50">
          <th className="text-left px-4 py-1.5 w-8 font-medium">#</th>
          <th className="text-left px-2 py-1.5 w-16 font-medium">Type</th>
          <th className="text-left px-2 py-1.5 font-medium">Step</th>
          <th className="text-left px-2 py-1.5 w-32 font-medium">Detail</th>
          <th className="text-center px-2 py-1.5 w-20 font-medium">Score</th>
          <th className="text-center px-2 py-1.5 w-20 font-medium">Status</th>
          <th className="text-right px-4 py-1.5 w-32 font-medium">Time</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">{children}</tbody>
    </table>
  )
}

const TAG_STYLES: Record<string, string> = {
  LLM:       'text-purple-600 bg-purple-50 border-purple-200',
  File:      'text-cyan-600 bg-cyan-50 border-cyan-200',
  Dashboard: 'text-blue-600 bg-blue-50 border-blue-200',
  Manual:    'text-green-600 bg-green-50 border-green-200',
}

function StepRow({ step, tag, label, desc, status, time, detail, extra }: {
  step: number; tag: string; label: string; desc: string
  status: 'completed' | 'pending' | 'error'
  time: string | null; detail: string | null; extra?: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const statusIcon = status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
    : status === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-red-500" />
    : <Clock className="w-3.5 h-3.5 text-gray-300" />

  return (
    <>
      <tr className={`hover:bg-gray-50/80 transition-colors ${expanded ? 'bg-gray-50' : ''}`}>
        <td className="px-4 py-2 text-gray-400 tabular-nums">{step}</td>
        <td className="px-2 py-2">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${TAG_STYLES[tag] || 'text-gray-500 bg-gray-50 border-gray-200'}`}>
            {tag}
          </span>
        </td>
        <td className="px-2 py-2">
          <button onClick={() => setExpanded(e => !e)} className="text-left hover:text-gray-900 transition-colors w-full">
            <div className="font-medium text-gray-800">{label}</div>
          </button>
        </td>
        <td className="px-2 py-2 text-gray-500 font-mono text-[10px] max-w-[160px] truncate" title={detail || undefined}>
          {detail || '—'}
        </td>
        <td className="px-2 py-2 text-center">{extra ?? '—'}</td>
        <td className="px-2 py-2 text-center">{statusIcon}</td>
        <td className="px-4 py-2 text-right text-gray-400 whitespace-nowrap tabular-nums">
          {time ? new Date(time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-blue-50/30">
          <td colSpan={7} className="px-8 py-2 text-[11px] text-gray-500 italic border-b border-blue-100">{desc}</td>
        </tr>
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  AUDIT LOG                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AuditTable({ logs, appName }: {
  logs: AuditLogEntry[]
  appName: (id: string | null) => { name: string; slug: string; colorIdx: number } | null
}) {
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (quickFilter === 'errors') return logs.filter(l => !!l.context?.error)
    if (quickFilter === 'llm') return logs.filter(l => l.action === 'llm_call')
    return logs
  }, [logs, quickFilter])

  const toggleRow = (id: string) => setExpandedRows(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const exportCSV = () => {
    const csv = ['Time,Application,Actor,Action,Details',
      ...filtered.map(l => `"${l.created_at || ''}","${appName(l.project_id ?? null)?.name || ''}","${l.actor}","${l.action}","${JSON.stringify(l.context).slice(0, 80)}"`)
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-xs">
        <span className="font-semibold text-gray-500 uppercase tracking-wide">{filtered.length} entries</span>
        <div className="ml-4 flex items-center gap-1">
          {(['all', 'errors', 'llm'] as QuickFilter[]).map(f => (
            <button key={f} onClick={() => setQuickFilter(f)}
              className={`px-2.5 py-1 rounded transition-colors ${quickFilter === f ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : f === 'errors' ? 'Errors' : 'LLM Calls'}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} className="ml-auto flex items-center gap-1 text-gray-400 hover:text-gray-600 border border-gray-200 px-2 py-1 rounded hover:bg-gray-50 transition-colors">
          <Download className="w-3 h-3" /> CSV
        </button>
      </div>

      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
        {filtered.map(log => {
          const app = appName(log.project_id ?? null)
          const isExpanded = expandedRows.has(log.id)
          return (
            <div key={log.id}>
              <button onClick={() => toggleRow(log.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors text-left">
                {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                <span className="text-gray-400 whitespace-nowrap tabular-nums min-w-[110px]">
                  {log.created_at ? new Date(log.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </span>
                {app ? <AppBadge name={app.name} colorIdx={app.colorIdx} /> : <span className="text-gray-300 min-w-[80px]">—</span>}
                <span className="font-mono text-gray-600 min-w-[140px] truncate">{log.actor}</span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{log.action}</span>
                <span className="text-gray-400 truncate flex-1 font-mono">{JSON.stringify(log.context).slice(0, 80)}</span>
              </button>
              {isExpanded && (
                <div className="px-10 py-3 bg-gray-50 border-t border-gray-100 text-xs space-y-2">
                  <pre className="bg-white border border-gray-200 rounded p-3 overflow-auto max-h-40 text-gray-700 text-[10px] font-mono">
                    {JSON.stringify(log.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-gray-400">No audit log entries. Use a governed application to generate activity.</div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  GROUNDING                                                                  */
/* ═══════════════════════════════════════════════════════════════════════════ */
function GroundingTable({ records, appName }: {
  records: GroundingRecord[]
  appName: (id: string | null) => { name: string; slug: string; colorIdx: number } | null
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {records.length} {records.length === 1 ? 'record' : 'records'}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Application</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Agent</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Score <span className="text-gray-400 font-normal text-xs">(0–1)</span></th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Nodes <span className="text-gray-400 font-normal text-xs">(retrieved)</span></th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Query Path <span className="text-gray-400 font-normal text-xs">(Cypher)</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map(r => {
            const app = appName(r.project_id ?? null)
            return (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                  {r.created_at ? new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </td>
                <td className="px-4 py-3">{app ? <AppBadge name={app.name} colorIdx={app.colorIdx} /> : <span className="text-gray-400 text-xs">—</span>}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-800">{r.agent_name}</td>
                <td className="px-4 py-3"><ScoreBadge score={r.grounding_score ?? null} /></td>
                <td className="px-4 py-3 text-xs font-medium text-gray-700">{r.node_count}</td>
                <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate font-mono" title={r.query_path || undefined}>{r.query_path || '—'}</td>
              </tr>
            )
          })}
          {records.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No grounding records yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
