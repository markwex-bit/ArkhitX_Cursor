import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  BookOpen,
  ClipboardList,
  Database,
  GitCompare,
  ListChecks,
  Upload,
} from 'lucide-react'
import type {
  BacklogEntry,
  EligibilitySummary,
  IntakeSummary,
  MatchCandidate,
  MetadataCoverageReport,
  ParityRow,
  QlikDispositionResult,
  QlikQualificationSummary,
} from '../types'
import {
  getBacklog,
  getDispositions,
  getEligibility,
  getIntake,
  getMetadataCoverage,
  getMeta,
  getParityMatrix,
  getQlikQualification,
  refreshDispositions,
} from '../services/api'
import { PageHeader } from '../components/ui/PageHeader'
import { TabBar } from '../components/ui/TabBar'
import { ExplanationBanner } from '../components/ui/ExplanationBanner'
import IntakePanel from '../components/IntakePanel'
import EligibilityReport from '../components/EligibilityReport'
import QlikQualificationReport from '../components/QlikQualificationReport'
import MatchMatrix from '../components/MatchMatrix'
import DetailPane from '../components/DetailPane'
import Backlog from '../components/Backlog'
import MetadataReference from '../components/MetadataReference'

type WorkspaceTab = 'intake' | 'pbi' | 'qlik' | 'overlap' | 'backlog' | 'reference'

const TABS = [
  { key: 'intake' as const, label: '1. Intake', icon: Upload },
  { key: 'pbi' as const, label: '2. Power BI', icon: ClipboardList },
  { key: 'qlik' as const, label: '3. Qlik', icon: Database },
  { key: 'overlap' as const, label: '4. Overlap', icon: GitCompare },
  { key: 'backlog' as const, label: '5. Backlog', icon: ListChecks },
  { key: 'reference' as const, label: 'Reference', icon: BookOpen },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('intake')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [intake, setIntake] = useState<IntakeSummary | null>(null)
  const [coverage, setCoverage] = useState<MetadataCoverageReport[]>([])
  const [eligibility, setEligibility] = useState<EligibilitySummary | null>(null)
  const [qlikQualification, setQlikQualification] = useState<QlikQualificationSummary | null>(null)
  const [parityMatrix, setParityMatrix] = useState<ParityRow[]>([])
  const [dispositions, setDispositions] = useState<QlikDispositionResult[]>([])
  const [backlog, setBacklog] = useState<BacklogEntry[]>([])
  const [dataSource, setDataSource] = useState<'sample' | 'live' | null>(null)
  const [llmAnalysisReady, setLlmAnalysisReady] = useState(false)

  const [selected, setSelected] = useState<{
    qlikApp: QlikDispositionResult
    candidate: MatchCandidate
  } | null>(null)

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const formatLoadError = (e: unknown): string => {
    if (axios.isAxiosError(e)) {
      if (!e.response) {
        return (
          'Cannot reach the backend API. After `docker-compose up`, the backend can take ' +
          '30–60 seconds to install the ArkhitX SDK and start. Wait a moment, then click Retry.'
        )
      }
      const detail =
        typeof e.response.data === 'object' && e.response.data && 'detail' in e.response.data
          ? String((e.response.data as { detail: unknown }).detail)
          : null
      return detail
        ? `Backend error (${e.response.status}): ${detail}`
        : `Backend error (${e.response.status}). Check logs: docker logs qlik-pbi-migration-backend-1`
    }
    return 'Failed to load pipeline data.'
  }

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    const maxAttempts = 10
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const [intakeData, coverageData, elig, qlikQual, parity, disp, back, meta] = await Promise.all([
          getIntake(),
          getMetadataCoverage(),
          getEligibility(),
          getQlikQualification(),
          getParityMatrix(),
          getDispositions(),
          getBacklog(),
          getMeta(),
        ])
        setIntake(intakeData)
        setCoverage(coverageData)
        setEligibility(elig)
        setQlikQualification(qlikQual)
        setParityMatrix(parity)
        setDispositions(disp)
        setBacklog(back)
        setDataSource(meta.data_source)
        setLlmAnalysisReady(meta.llm_analysis_ready)
        setLoading(false)
        return
      } catch (e) {
        const retryable = axios.isAxiosError(e) && !e.response
        if (retryable && attempt < maxAttempts) {
          await sleep(Math.min(2000 * attempt, 8000))
          continue
        }
        console.error(e)
        setError(formatLoadError(e))
        setLoading(false)
        return
      }
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRunLlm = async () => {
    setRefreshing(true)
    setError(null)
    try {
      const enriched = await refreshDispositions()
      setDispositions(enriched)
      setLlmAnalysisReady(true)
      const back = await getBacklog()
      setBacklog(back)
    } catch (e) {
      console.error(e)
      setError('LLM analysis failed. Check ANTHROPIC_API_KEY in projects/qlik-pbi-migration/.env.')
    } finally {
      setRefreshing(false)
    }
  }

  const handleSignedOff = async () => {
    const back = await getBacklog()
    setBacklog(back)
  }

  const dataSourceBadge =
    dataSource && (
      <span
        title={
          dataSource === 'live'
            ? 'Reading live from Qlik Sense and Power BI admin APIs.'
            : 'Reading from samples/*.json — set DATA_SOURCE=live in .env for real data.'
        }
        className={dataSource === 'live' ? 'ax-badge-ok' : 'ax-badge-warn'}
      >
        {dataSource === 'live' ? 'Live data' : 'Sample data'}
      </span>
    )

  if (loading) {
    return (
      <div className="ax-page">
        <div className="flex-1 flex items-center justify-center text-[11px] text-ax-text-muted">
          <div className="text-center space-y-1">
            <div>Loading pipeline…</div>
            <div className="text-[10px]">Start at Intake — confirm metadata before overlap.</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ax-page">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-ax-red max-w-lg text-center text-sm">{error}</p>
          <button type="button" onClick={loadAll} className="ax-btn-primary">
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ax-page">
      <PageHeader
        icon={GitCompare}
        title="Migration Assessor"
        subtitle="Intake → qualify each platform → overlap → sign-off (see docs/USER-WORKFLOW.md)"
        actions={
          <>
            {dataSourceBadge}
            <button
              type="button"
              onClick={handleRunLlm}
              disabled={refreshing}
              className="ax-btn-primary disabled:opacity-50"
            >
              {refreshing ? 'Running LLM…' : 'Run LLM analysis'}
            </button>
          </>
        }
      >
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} className="mt-2" />
      </PageHeader>

      <div className="ax-page-body scrollbar-thin">
        {activeTab === 'intake' && intake && (
          <IntakePanel intake={intake} coverage={coverage} />
        )}

        {activeTab === 'pbi' && eligibility && <EligibilityReport summary={eligibility} />}

        {activeTab === 'qlik' && qlikQualification && (
          <QlikQualificationReport summary={qlikQualification} />
        )}

        {activeTab === 'overlap' && (
          <>
            {!llmAnalysisReady && (
              <ExplanationBanner
                summary="Phase 4 — qualified Qlik × eligible Power BI only"
                explanation="Overlap uses apps that passed Qlik qualification and Power BI eligibility. Deterministic signals run first. Click Run LLM analysis for semantic match and migration advisor (Anthropic API)."
              />
            )}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 min-h-0">
              <div className="xl:col-span-2 min-h-0">
                <MatchMatrix
                  dispositions={dispositions}
                  onSelectCandidate={(qlikApp, candidate) => setSelected({ qlikApp, candidate })}
                  selectedCandidateId={
                    selected
                      ? `${selected.qlikApp.qlik_app_id}::${selected.candidate.pbi_dataset_id}`
                      : undefined
                  }
                />
              </div>
              <div className="min-h-0">
                {selected ? (
                  <DetailPane
                    qlikApp={selected.qlikApp}
                    candidate={selected.candidate}
                    onSignedOff={handleSignedOff}
                  />
                ) : (
                  <div className="ax-panel-pad text-xs text-ax-text-muted italic h-full">
                    Select a candidate to review and sign off.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'backlog' && <Backlog entries={backlog} />}

        {activeTab === 'reference' && <MetadataReference parityMatrix={parityMatrix} />}
      </div>
    </div>
  )
}
