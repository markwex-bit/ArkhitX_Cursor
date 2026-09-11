import { useEffect, useState } from 'react'
import type {
  BacklogEntry,
  EligibilitySummary,
  MatchCandidate,
  ParityRow,
  QlikDispositionResult,
  QlikQualityResult,
} from '../types'
import {
  getBacklog,
  getDispositions,
  getEligibility,
  getMeta,
  getParityMatrix,
  getQlikQuality,
  refreshDispositions,
} from '../services/api'
import Tabs from '../components/Tabs'
import EligibilityReport from '../components/EligibilityReport'
import QualityDashboard from '../components/QualityDashboard'
import MatchMatrix from '../components/MatchMatrix'
import DetailPane from '../components/DetailPane'
import Backlog from '../components/Backlog'
import MetadataReference from '../components/MetadataReference'

const TABS = [
  { id: 'eligibility', label: '1. Eligibility Report' },
  { id: 'quality', label: '2. Quality Dashboard' },
  { id: 'matches', label: '3. Match Matrix' },
  { id: 'backlog', label: '4. Migration Backlog' },
  { id: 'metadata', label: '5. Metadata Reference' },
]

export default function HomePage() {
  const [activeTab, setActiveTab] = useState('eligibility')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [eligibility, setEligibility] = useState<EligibilitySummary | null>(null)
  const [qlikQuality, setQlikQuality] = useState<QlikQualityResult[]>([])
  const [parityMatrix, setParityMatrix] = useState<ParityRow[]>([])
  const [dispositions, setDispositions] = useState<QlikDispositionResult[]>([])
  const [backlog, setBacklog] = useState<BacklogEntry[]>([])
  const [dataSource, setDataSource] = useState<'sample' | 'live' | null>(null)

  const [selected, setSelected] = useState<{
    qlikApp: QlikDispositionResult
    candidate: MatchCandidate
  } | null>(null)

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [elig, quality, parity, disp, back, meta] = await Promise.all([
        getEligibility(),
        getQlikQuality(),
        getParityMatrix(),
        getDispositions(),
        getBacklog(),
        getMeta(),
      ])
      setEligibility(elig)
      setQlikQuality(quality)
      setParityMatrix(parity)
      setDispositions(disp)
      setBacklog(back)
      setDataSource(meta.data_source)
    } catch (e) {
      console.error(e)
      setError(
        'Failed to load pipeline data. Is the backend running? Check ANTHROPIC_API_KEY in .env.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshDispositions()
      await loadAll()
    } finally {
      setRefreshing(false)
    }
  }

  const handleSignedOff = async () => {
    const back = await getBacklog()
    setBacklog(back)
  }

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-500">
        Running eligibility filter, quality pass, candidate generation, and LLM matching…
        <div className="text-xs mt-2 text-gray-400">
          (First load triggers real Anthropic API calls for the semantic match + advisor agents
          — this can take up to a minute.)
        </div>
      </div>
    )
  }

  if (error) {
    return <div className="text-center py-20 text-rose-600">{error}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">
              Qlik → Power BI Migration Assessor
            </h2>
            {dataSource && (
              <span
                title={
                  dataSource === 'live'
                    ? 'Reading live from Qlik Sense (QRS + Engine API) and Power BI (Admin Scanner API). Set DATA_SOURCE=sample in .env to switch back.'
                    : 'Reading from samples/*.json. Set DATA_SOURCE=live in .env (see docs/LIVE-EXTRACTION-SETUP.md) to pull real data.'
                }
                className={
                  'text-xs font-medium px-2 py-0.5 rounded-full border ' +
                  (dataSource === 'live'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200')
                }
              >
                {dataSource === 'live' ? '● Live data' : '● Sample data'}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            Triage and prioritization tool — not an autonomous decision tool. Every
            recommendation requires human sign-off before it reaches the backlog.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-sm bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5 rounded"
        >
          {refreshing ? 'Refreshing…' : 'Re-run pipeline'}
        </button>
      </div>

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'eligibility' && eligibility && (
        <EligibilityReport summary={eligibility} />
      )}

      {activeTab === 'quality' && (
        <QualityDashboard qlikQuality={qlikQuality} parityMatrix={parityMatrix} />
      )}

      {activeTab === 'matches' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <MatchMatrix
              dispositions={dispositions}
              onSelectCandidate={(qlikApp, candidate) => setSelected({ qlikApp, candidate })}
              selectedCandidateId={
                selected ? `${selected.qlikApp.qlik_app_id}::${selected.candidate.pbi_dataset_id}` : undefined
              }
            />
          </div>
          <div className="col-span-1">
            {selected ? (
              <DetailPane
                qlikApp={selected.qlikApp}
                candidate={selected.candidate}
                onSignedOff={handleSignedOff}
              />
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-sm text-gray-500 italic">
                Select a candidate from the match matrix to see details and sign off.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'backlog' && <Backlog entries={backlog} />}

      {activeTab === 'metadata' && <MetadataReference />}
    </div>
  )
}
