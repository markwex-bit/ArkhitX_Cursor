import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { applicationsApi, arkhitxAgentsApi } from '../lib/api'
import {
  ChevronLeft, Hammer, FileCheck2, Network, ShieldCheck,
  CheckCircle2, AlertCircle, Loader2, ExternalLink, Activity, BookOpen,
  ClipboardList, X, UserCheck, Sparkles, ScanSearch, Code2, ChevronDown, ChevronUp,
} from 'lucide-react'

interface AppDetail {
  slug: string
  name: string
  description: string
  ports: { frontend: number; backend: number; db: number }
  on_disk: boolean
  current_phase: 0 | 1 | 2 | 3
  project_id: string | null
  phases: {
    build:    { ready: boolean; ontology_present: boolean; prompts_present: boolean; seed_present: boolean }
    register: { complete: boolean; project_id: string | null }
    seed:     { complete: boolean; events: number }
    govern:   { audit_logs: number; grounding_records: number }
  }
}

interface AuditLog {
  id: string
  actor: string
  action: string
  context: Record<string, unknown>
  created_at: string | null
}

interface GroundingRecord {
  id: string
  agent_name: string
  grounding_score: number | null
  node_count: number
  query_path: string | null
  created_at: string | null
}

interface Governance {
  project_id: string | null
  audit_logs: AuditLog[]
  grounding_records: GroundingRecord[]
  summary: { total_calls: number; avg_grounding_score: number | null; grounding_call_count?: number }
}

interface VerificationRule {
  id:          string
  name:        string
  check:       string
  artifact:    string
  verified:    boolean
  verifier:    string | null
  notes:       string
  verified_at: string | null
}

interface VerificationStatus {
  rules:          VerificationRule[]
  verified_count: number
  total:          number
}

const PHASE_META = [
  { key: 'build',    label: 'Build',    icon: Hammer,       desc: 'Standalone application running with Claude' },
  { key: 'register', label: 'Register', icon: FileCheck2,   desc: 'Project registered with ArkhitX, ontology stored, prompts seeded' },
  { key: 'seed',     label: 'Seed',     icon: Network,      desc: 'Knowledge graph populated with reference data' },
  { key: 'govern',   label: 'Govern',   icon: ShieldCheck,  desc: 'Agents actively logging audit + grounding' },
] as const

export default function ApplicationDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [app, setApp] = useState<AppDetail | null>(null)
  const [governance, setGovernance] = useState<Governance | null>(null)
  const [verification, setVerification] = useState<VerificationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    if (!slug) return
    const [appRes, govRes] = await Promise.all([
      applicationsApi.get(slug),
      applicationsApi.governance(slug),
    ])
    setApp(appRes.data)
    setGovernance(govRes.data)
    setLoading(false)
    // Load verification status if project is registered
    if (appRes.data?.project_id) {
      applicationsApi.verificationStatus(slug).then(r => setVerification(r.data)).catch(() => {})
    }
  }, [slug])

  useEffect(() => { refresh() }, [refresh])

  const handleAction = async (action: 'register' | 'seedGraph', label: string) => {
    if (!slug) return
    setBusy(action)
    setMessage(null)
    try {
      const { data } = await applicationsApi[action](slug)
      setMessage({ type: 'ok', text: `${label} complete — ${JSON.stringify(data)}` })
      await refresh()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setMessage({ type: 'err', text: err.response?.data?.detail || `${label} failed` })
    } finally {
      setBusy(null)
    }
  }

  if (loading || !app) {
    return <div className="p-8 text-gray-400">Loading…</div>
  }

  const currentPhase = app.current_phase

  return (
    <div className="p-8 max-w-6xl">
      <Link to="/applications" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ChevronLeft className="w-4 h-4" />
        All Applications
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
        <p className="text-gray-500 mt-1">{app.description}</p>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
          <span>slug: <code className="font-mono">{app.slug}</code></span>
          <a href={`http://localhost:${app.ports.frontend}`} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            Open app <ExternalLink className="w-3 h-3" />
          </a>
          <a href={`http://localhost:${app.ports.backend}/docs`} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 text-blue-600 hover:underline">
            API docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Phase strip */}
      <div className="mb-6 p-5 bg-white rounded-xl border border-gray-200">
        <div className="grid grid-cols-4 gap-3">
          {PHASE_META.map((p, idx) => {
            const isComplete = idx < currentPhase
            const isCurrent  = idx === currentPhase
            const Icon = p.icon
            return (
              <div key={p.key} className={`p-3 rounded-lg border-2 ${
                isComplete ? 'border-green-200 bg-green-50' :
                isCurrent  ? 'border-blue-300  bg-blue-50'  :
                             'border-gray-200  bg-gray-50'
              }`}>
                <div className="flex items-center justify-between">
                  <Icon className={`w-5 h-5 ${
                    isComplete ? 'text-green-600' :
                    isCurrent  ? 'text-blue-600'  :
                                 'text-gray-400'
                  }`} />
                  {isComplete && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                </div>
                <div className="mt-2 font-semibold text-sm text-gray-900">
                  Phase {idx}: {p.label}
                </div>
                <div className="text-xs text-gray-500 mt-1">{p.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'ok' ? 'bg-green-50 text-green-800 border border-green-200'
                                : 'bg-red-50   text-red-800   border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* LEFT: How-To / Next Step (contextual) */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-gray-900">How To — Next Step</h2>
            </div>

            {currentPhase === 0 && (
              <HowToBuild
                app={app}
                busy={busy === 'register'}
                onRegister={() => handleAction('register', 'Register')}
              />
            )}
            {currentPhase === 1 && (
              <HowToSeed
                app={app}
                busy={busy === 'seedGraph'}
                onRun={() => handleAction('seedGraph', 'Seed Graph')}
              />
            )}
            {currentPhase === 2 && <HowToGovern app={app} />}
            {currentPhase === 3 && <HowToGovern app={app} />}
          </div>
        </div>

        {/* RIGHT: Governance feed + wiring checklist */}
        <div className="col-span-2 space-y-4">
          <GovernanceSummary governance={governance} app={app} />
          {currentPhase >= 2 && (
            <WiringChecklist
              slug={app.slug}
              verification={verification}
              onVerified={() => {
                if (slug) applicationsApi.verificationStatus(slug).then(r => setVerification(r.data)).catch(() => {})
              }}
            />
          )}
          <GovernanceFeed governance={governance} />
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  How-To panels (one per phase)                                             */
/* ────────────────────────────────────────────────────────────────────────── */

function HowToBuild({ app, busy, onRegister }: { app: AppDetail; busy: boolean; onRegister: () => void }) {
  const allReady = app.phases.build.ontology_present && app.phases.build.prompts_present && app.phases.build.seed_present
  const [extracting, setExtracting] = useState(false)
  const [extracted, setExtracted]   = useState<Record<string, unknown> | null>(null)
  const [extractErr, setExtractErr] = useState<string | null>(null)

  const handleExtract = async () => {
    setExtracting(true)
    setExtractErr(null)
    setExtracted(null)
    try {
      const { data } = await arkhitxAgentsApi.extractOntology(app.slug)
      setExtracted(data.ontology)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setExtractErr(err.response?.data?.detail || 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-700">
        The app is running standalone with Claude — no governance yet. Start it with:
      </p>
      <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto">
{`cd projects/${app.slug}
docker-compose up --build`}
      </pre>
      <p className="text-gray-700">
        Open <a href={`http://localhost:${app.ports.frontend}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">localhost:{app.ports.frontend}</a> and try it out. When ready, add ArkhitX governance below.
      </p>

      <hr className="my-3" />
      <p className="text-xs font-semibold text-gray-700 mb-2">Governance files — Phase 1 readiness:</p>
      <ReadyItem ok={app.phases.build.ontology_present} label="ontology JSON" />
      <ReadyItem ok={app.phases.build.prompts_present}  label="governance/prompts.json" />
      <ReadyItem ok={app.phases.build.seed_present}     label="governance/seed_data.json" />

      {/* AI Ontology Extractor */}
      {!app.phases.build.ontology_present && (
        <div className="pt-1">
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span className="text-xs font-semibold text-violet-800">ArkhitX Agent — Generate Ontology</span>
            </div>
            <p className="text-xs text-violet-700">
              No ontology file yet. ArkhitX can read your project's Python models and agents,
              then generate the ontology JSON automatically.
            </p>
            <button
              onClick={handleExtract}
              disabled={extracting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-xs font-medium"
            >
              {extracting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting…</>
                          : <><Sparkles className="w-3.5 h-3.5" /> Generate Ontology from Code</>}
            </button>
            {extractErr && <p className="text-xs text-red-700">{extractErr}</p>}
            {extracted && (
              <div>
                <p className="text-xs text-green-700 font-medium mb-1">
                  ✓ Ontology extracted — copy this to <code>projects/{app.slug}/ontology/{app.slug.replace(/-/g, '_')}.json</code>
                </p>
                <pre className="bg-gray-900 text-gray-100 text-xs p-2 rounded overflow-auto max-h-48">
                  {JSON.stringify(extracted, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {allReady ? (
        <div className="pt-2">
          <p className="text-xs text-green-700 mb-2">All files present — ready to register.</p>
          <button
            onClick={onRegister}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
          >
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Registering…</>
                  : 'Register with ArkhitX →'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
          Missing governance files. Use Cursor to create them, or use the agent above to generate the ontology.
        </p>
      )}
    </div>
  )
}

function HowToSeed({ app, busy, onRun }: { app: AppDetail; busy: boolean; onRun: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-700">
        Populate the Neo4j knowledge graph with reference data from
        {' '}<code>governance/seed_data.json</code>.
      </p>
      <p className="text-xs text-gray-600">
        Agents use this data as grounding context — risk scoring and Q&A will compare
        against these nodes.
      </p>
      <button
        onClick={onRun}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
      >
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Seeding…</>
              : 'Seed Knowledge Graph'}
      </button>
      <p className="text-xs text-gray-500 mt-2">
        After seeding, restart the application's containers so the agents pick up
        {' '}<code>ARKHITX_PROJECT_ID</code> from <code>.env</code>.
      </p>
    </div>
  )
}

function HowToGovern({ app }: { app: AppDetail }) {
  const [agentName, setAgentName]     = useState('')
  const [agentPurpose, setAgentPurpose] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [generated, setGenerated]     = useState<{ method_code: string; cypher_query: string; explanation: string } | null>(null)
  const [genErr, setGenErr]           = useState<string | null>(null)
  const [showGen, setShowGen]         = useState(false)

  const handleGenerate = async () => {
    if (!agentName.trim() || !agentPurpose.trim()) return
    setGenerating(true)
    setGenErr(null)
    setGenerated(null)
    try {
      const { data } = await arkhitxAgentsApi.generateGroundingQuery(app.slug, agentName.trim(), agentPurpose.trim())
      setGenerated(data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setGenErr(err.response?.data?.detail || 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-gray-700 font-medium">Phase 3 — Wire Governance</p>
      <p className="text-gray-600 text-xs">
        In Cursor, replace <code>BaseAgent</code> with <code>GovernedBaseAgent</code> in each
        agent file, then load prompts from the database using <code>get_prompt()</code>.
      </p>
      <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{`from arkhitx import GovernedBaseAgent

class MyAgent(GovernedBaseAgent):
  def get_system_prompt(self):
    # loads from agent_prompts table
    return self._arkhitx.get_prompt(
      "my-agent-id"
    )

  def _grounding_query(self, msg):
    return {"query": "MATCH (n) RETURN n"}
`}</pre>
      <p className="text-xs text-gray-500">
        Once wired, use the <strong>Wiring Checklist</strong> below to verify and
        sign off each governance rule. Each verification is logged to the audit trail
        as client-facing evidence.
      </p>
      <div className="pt-1 text-xs space-y-1">
        <div className="flex justify-between text-gray-600">
          <span>Audit logs so far</span>
          <span className="font-mono">{app.phases.govern.audit_logs}</span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Grounding records</span>
          <span className="font-mono">{app.phases.govern.grounding_records}</span>
        </div>
      </div>

      {/* Grounding Query Generator */}
      <div className="pt-2">
        <button
          onClick={() => setShowGen(g => !g)}
          className="w-full flex items-center justify-between px-3 py-2 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            <span className="text-xs font-semibold text-violet-800">Generate _grounding_query()</span>
          </div>
          {showGen ? <ChevronUp className="w-3.5 h-3.5 text-violet-500" /> : <ChevronDown className="w-3.5 h-3.5 text-violet-500" />}
        </button>

        {showGen && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-gray-600">
              Enter an agent name and what it does. ArkhitX will generate the correct
              <code> _grounding_query()</code> method to paste into that agent class.
            </p>
            <input
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder="Agent class name (e.g. ContractReviewAgent)"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
            />
            <textarea
              value={agentPurpose}
              onChange={e => setAgentPurpose(e.target.value)}
              placeholder="What does this agent do? (e.g. Reviews contract text, extracts risk clauses, scores overall risk)"
              rows={3}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 resize-none"
            />
            <button
              onClick={handleGenerate}
              disabled={generating || !agentName.trim() || !agentPurpose.trim()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-xs font-medium"
            >
              {generating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                          : <><Code2 className="w-3.5 h-3.5" /> Generate Method</>}
            </button>
            {genErr && <p className="text-xs text-red-700">{genErr}</p>}
            {generated && (
              <div className="space-y-2">
                <p className="text-xs text-violet-700 font-medium">{generated.explanation}</p>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Paste this into your agent class:</p>
                  <pre className="bg-gray-900 text-gray-100 text-xs p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap">
                    {generated.method_code}
                  </pre>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Cypher query it will run:</p>
                  <pre className="bg-gray-800 text-green-300 text-xs p-2 rounded overflow-auto whitespace-pre-wrap">
                    {generated.cypher_query}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ReadyItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
          : <AlertCircle  className="w-3.5 h-3.5 text-gray-400" />}
      <span className={ok ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Phase 3 — Wiring Checklist                                                */
/* ────────────────────────────────────────────────────────────────────────── */

interface ComplianceFinding {
  rule_id:    string
  status:     'COMPLIANT' | 'PARTIAL' | 'MISSING' | 'NOT_APPLICABLE'
  evidence:   string
  suggestion: string
}

interface WiringChecklistProps {
  slug:         string
  verification: VerificationStatus | null
  onVerified:   () => void
}

function WiringChecklist({ slug, verification, onVerified }: WiringChecklistProps) {
  const [expanded, setExpanded]     = useState(true)
  const [modal, setModal]           = useState<VerificationRule | null>(null)
  const [scanning, setScanning]     = useState(false)
  const [scanResult, setScanResult] = useState<{ findings: ComplianceFinding[]; summary: string; files_read: string[] } | null>(null)
  const [scanErr, setScanErr]       = useState<string | null>(null)

  const handleScan = async () => {
    setScanning(true)
    setScanErr(null)
    setScanResult(null)
    try {
      const { data } = await arkhitxAgentsApi.detectCompliance(slug)
      setScanResult(data)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setScanErr(err.response?.data?.detail || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  const findingFor = (ruleId: string): ComplianceFinding | undefined =>
    scanResult?.findings.find(f => f.rule_id === ruleId)

  if (!verification) return null

  const { rules, verified_count, total } = verification
  const pct = Math.round((verified_count / total) * 100)
  const allDone = verified_count === total

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-purple-600" />
          <span className="font-semibold text-gray-900 text-sm">Phase 3 — Wiring Checklist</span>
          {allDone && <CheckCircle2 className="w-4 h-4 text-green-600" />}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-purple-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-600">{verified_count}/{total}</span>
          </div>
          <span className="text-xs text-gray-400">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div>
          {/* Explanation banner + Scan button */}
          <div className="px-5 py-3 bg-purple-50 border-b border-purple-100 text-xs text-purple-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong>Why this checklist exists:</strong> AI can wire the governance code, but only a human
                can confirm it's actually working. Each item below tells you exactly what to check and what
                evidence to record. When you click "Mark Verified", your sign-off is logged to the audit trail
                — this is the client-facing proof that governance is real, not assumed.
              </div>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-xs font-medium whitespace-nowrap"
              >
                {scanning
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
                  : <><ScanSearch className="w-3.5 h-3.5" /> Scan Code</>}
              </button>
            </div>
            {scanErr && <p className="mt-2 text-red-700">{scanErr}</p>}
            {scanResult && (
              <div className="mt-2 pt-2 border-t border-purple-200">
                <p className="font-medium">Scan complete — {scanResult.files_read.length} files read</p>
                <p className="mt-0.5 text-purple-700 italic">{scanResult.summary}</p>
                <p className="mt-1 text-purple-600">
                  Agent findings are shown below each rule. You still need to verify each one manually and click "Mark Verified".
                </p>
              </div>
            )}
          </div>

          {allDone && (
            <div className="px-5 py-3 bg-green-50 border-b border-green-100 text-sm text-green-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              All 7 governance rules verified. This application is at Phase 3 — fully governed.
            </div>
          )}

          {/* Rules list */}
          <div className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} finding={findingFor(rule.id)} onMark={() => setModal(rule)} />
            ))}
          </div>
        </div>
      )}

      {/* Verify modal */}
      {modal && (
        <VerifyModal
          slug={slug}
          rule={modal}
          onClose={() => setModal(null)}
          onVerified={() => { setModal(null); onVerified() }}
        />
      )}
    </div>
  )
}

const FINDING_COLORS: Record<string, string> = {
  COMPLIANT:       'bg-green-50  border-green-200  text-green-800',
  PARTIAL:         'bg-amber-50  border-amber-200  text-amber-800',
  MISSING:         'bg-red-50    border-red-200    text-red-800',
  NOT_APPLICABLE:  'bg-gray-50   border-gray-200   text-gray-600',
}

function RuleRow({ rule, finding, onMark }: { rule: VerificationRule; finding?: ComplianceFinding; onMark: () => void }) {
  const [showDetail, setShowDetail] = useState(false)
  return (
    <div className={`p-4 ${rule.verified ? 'bg-green-50/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {rule.verified
            ? <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
            : <AlertCircle  className="w-4 h-4 text-gray-300  mt-0.5 shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-400">{rule.id}</span>
              <span className="text-sm font-medium text-gray-900">{rule.name}</span>
            </div>
            {rule.verified && (
              <div className="mt-1 text-xs text-green-700 flex items-center gap-1">
                <UserCheck className="w-3 h-3" />
                Verified by <strong>{rule.verifier}</strong>
                {rule.verified_at && (
                  <span className="text-gray-400 ml-1">
                    · {new Date(rule.verified_at).toLocaleDateString()} {new Date(rule.verified_at).toLocaleTimeString()}
                  </span>
                )}
              </div>
            )}
            {rule.verified && rule.notes && (
              <div className="mt-1 text-xs text-gray-500 italic">"{rule.notes}"</div>
            )}
            {finding && !rule.verified && (
              <div className={`mt-2 text-xs border rounded p-2 ${FINDING_COLORS[finding.status] || FINDING_COLORS.MISSING}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <ScanSearch className="w-3 h-3" />
                  <span className="font-semibold">Agent finding: {finding.status}</span>
                </div>
                <p className="mb-1">{finding.evidence}</p>
                {finding.suggestion && (
                  <p className="font-medium">→ {finding.suggestion}</p>
                )}
              </div>
            )}
            {showDetail && (
              <div className="mt-2 space-y-2">
                {finding ? (
                  // Context-aware instructions driven by the scan finding
                  <>
                    {finding.status === 'COMPLIANT' && (
                      <div className="text-xs text-green-800 bg-green-50 border border-green-200 rounded p-2">
                        <p className="font-semibold mb-1">✓ Scan confirmed compliant — confirm with this quick check:</p>
                        <p>{rule.check}</p>
                      </div>
                    )}
                    {finding.status === 'PARTIAL' && (
                      <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                        <p className="font-semibold mb-1">⚠ Scan found a gap — resolve this before signing off:</p>
                        <p className="mb-2"><span className="font-medium">What the scan found:</span> {finding.evidence}</p>
                        {finding.suggestion && (
                          <p><span className="font-medium">What to fix:</span> {finding.suggestion}</p>
                        )}
                      </div>
                    )}
                    {finding.status === 'MISSING' && (
                      <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded p-2">
                        <p className="font-semibold mb-1">✗ Scan found this rule not implemented — what to do:</p>
                        <p className="mb-2"><span className="font-medium">What the scan found:</span> {finding.evidence}</p>
                        {finding.suggestion && (
                          <p><span className="font-medium">Implementation steps:</span> {finding.suggestion}</p>
                        )}
                      </div>
                    )}
                    {finding.status === 'NOT_APPLICABLE' && (
                      <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2">
                        <p className="font-semibold mb-1">ℹ Scan marked as not applicable — confirm this is intentional:</p>
                        <p>{finding.evidence}</p>
                      </div>
                    )}
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                      <p className="font-semibold mb-1">Evidence to record when you sign off:</p>
                      {finding.status === 'COMPLIANT' || finding.status === 'NOT_APPLICABLE' ? (
                        <p>{rule.artifact}</p>
                      ) : (
                        <p>After resolving the gap above — {rule.artifact.charAt(0).toLowerCase() + rule.artifact.slice(1)}</p>
                      )}
                    </div>
                  </>
                ) : (
                  // Generic instructions when no scan has been run yet
                  <>
                    <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2">
                      <p className="font-semibold text-gray-800 mb-1">What to check:</p>
                      <p>{rule.check}</p>
                    </div>
                    <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                      <p className="font-semibold mb-1">Evidence to record:</p>
                      <p>{rule.artifact}</p>
                    </div>
                    <p className="text-xs text-gray-400 italic">
                      Run "Scan Code" above to get instructions specific to what was found in this project's code.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowDetail(d => !d)}
            className="text-xs text-gray-400 hover:text-gray-600 underline"
          >
            {showDetail ? 'hide' : 'how to check'}
          </button>
          {!rule.verified && (
            <button
              onClick={onMark}
              className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Mark Verified
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface VerifyModalProps {
  slug:       string
  rule:       VerificationRule
  onClose:    () => void
  onVerified: () => void
}

function VerifyModal({ slug, rule, onClose, onVerified }: VerifyModalProps) {
  const [verifier, setVerifier] = useState('')
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const verifierRef             = useRef<HTMLInputElement>(null)

  useEffect(() => { verifierRef.current?.focus() }, [])

  const submit = async () => {
    if (!verifier.trim()) { setError('Your name is required.'); return }
    if (!notes.trim())    { setError('Please describe the evidence you observed.'); return }
    setSaving(true)
    setError(null)
    try {
      await applicationsApi.verifyRule(slug, rule.id, verifier.trim(), notes.trim())
      onVerified()
    } catch {
      setError('Failed to save verification. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <div className="text-xs font-mono text-gray-400">{rule.id}</div>
            <h2 className="font-semibold text-gray-900">{rule.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Checklist */}
        <div className="px-6 py-4 space-y-3">
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="font-semibold text-gray-800 mb-1">What to check before signing off:</p>
            <p>{rule.check}</p>
          </div>
          <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="font-semibold mb-1">Evidence to record:</p>
            <p>{rule.artifact}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Your name <span className="text-red-500">*</span>
            </label>
            <input
              ref={verifierRef}
              value={verifier}
              onChange={e => setVerifier(e.target.value)}
              placeholder="e.g. Alex Smith"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Evidence observed — what did you see that confirms this rule is working? <span className="text-red-500">*</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Ran the contract review agent, confirmed audit log entry appeared immediately with actor='contract-review-agent' and action='llm_call'."
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            This sign-off will be logged to the audit trail with your name and timestamp.
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Sign off verification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Governance feed                                                           */
/* ────────────────────────────────────────────────────────────────────────── */

function GovernanceSummary({ governance, app }: { governance: Governance | null; app: AppDetail }) {
  if (!governance || !governance.project_id) {
    return (
      <div className="p-5 bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
        Application is not registered yet. Complete Phase 1 to start governance.
      </div>
    )
  }
  return (
    <div className="p-5 bg-white rounded-xl border border-gray-200">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-blue-600" />
        <h2 className="font-semibold text-gray-900">Governance Summary</h2>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total calls"      value={governance.summary.total_calls} />
        <Stat label="Grounded calls"   value={governance.summary.grounding_call_count || 0} />
        <Stat
          label="Avg grounding"
          value={governance.summary.avg_grounding_score?.toFixed(2) || '—'}
          tone={
            governance.summary.avg_grounding_score === null ? 'gray' :
            governance.summary.avg_grounding_score >= 0.7   ? 'green' :
            governance.summary.avg_grounding_score >= 0.4   ? 'amber' :
                                                              'red'
          }
        />
      </div>
      <p className="text-xs text-gray-400 mt-3">
        ArkhitX project_id: <code>{app.project_id}</code>
      </p>
    </div>
  )
}

function Stat({ label, value, tone = 'gray' }: { label: string; value: number | string; tone?: 'gray' | 'green' | 'amber' | 'red' }) {
  const colors: Record<string, string> = {
    gray:  'text-gray-900',
    green: 'text-green-700',
    amber: 'text-amber-700',
    red:   'text-red-700',
  }
  return (
    <div className="text-center p-3 bg-gray-50 rounded-lg">
      <div className={`text-2xl font-bold ${colors[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function GovernanceFeed({ governance }: { governance: Governance | null }) {
  if (!governance || !governance.project_id) return null
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="font-semibold text-gray-900 text-sm">Recent Activity</h2>
      </div>
      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
        {governance.audit_logs.length === 0 && (
          <div className="p-8 text-center text-gray-400 text-sm">
            No agent calls yet. Use the application to generate activity.
          </div>
        )}
        {governance.audit_logs.map((log) => {
          const grounding = governance.grounding_records.find(
            r => r.agent_name?.toLowerCase() === log.actor?.toLowerCase()
                 && r.created_at === log.created_at
          )
          return (
            <div key={log.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-600">{log.actor}</span>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                      {log.action}
                    </span>
                  </div>
                  {Object.keys(log.context || {}).length > 0 && (
                    <pre className="mt-1 text-xs text-gray-500 truncate max-w-md font-mono">
                      {JSON.stringify(log.context).slice(0, 120)}
                    </pre>
                  )}
                </div>
                <div className="text-right">
                  {grounding && grounding.grounding_score !== null && (
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                      grounding.grounding_score >= 0.7 ? 'bg-green-100 text-green-700' :
                      grounding.grounding_score >= 0.4 ? 'bg-yellow-100 text-yellow-700' :
                                                          'bg-red-100 text-red-700'
                    }`}>
                      {grounding.grounding_score.toFixed(2)}
                    </span>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
