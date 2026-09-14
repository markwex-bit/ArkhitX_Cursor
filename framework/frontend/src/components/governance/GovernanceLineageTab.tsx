import { useState } from 'react'
import { CheckCircle2, Circle, XCircle, ChevronRight } from 'lucide-react'
import { ExplanationBanner } from '../ui/ExplanationBanner'
import { cn } from '../../lib/utils'

interface SolutionStage {
  stage?: string
  done?: number
  total?: number
  tokens?: number
}

interface LineageData {
  project?: { name?: string; current_phase?: number; phase_status?: string }
  solution_pipeline?: {
    summary?: { total_steps?: number; completed?: number; total_tokens?: number }
    stages?: SolutionStage[]
  }
  governance?: {
    audit_count?: number
    grounding_avg?: number | null
    llm_calls?: number
    total_tokens?: number
  }
}

type NodeKey = 'ingestion' | 'eligibility' | 'quality' | 'candidates' | 'semantic' | 'advisor' | 'signoff'

interface FlowNode {
  key: NodeKey
  label: string
  done: boolean | 'partial'
  short: string
}

const STAGE_KEYS: Record<string, NodeKey> = {
  'Data Ingestion': 'ingestion',
  Eligibility: 'eligibility',
  'Qlik Quality': 'quality',
  'Candidate Generation': 'candidates',
  'Semantic Match': 'semantic',
  'Migration Advisor': 'advisor',
  'HITL Sign-off': 'signoff',
}

function nodeStatus(done: boolean | 'partial') {
  if (done === true) return { Icon: CheckCircle2, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' }
  if (done === 'partial') return { Icon: Circle, color: 'text-ax-amber border-ax-amber/40 bg-ax-amber/10' }
  return { Icon: XCircle, color: 'text-ax-text-muted border-ax-border bg-ax-bg-3' }
}

function stageDone(stage: SolutionStage | undefined): boolean | 'partial' {
  if (!stage || !stage.total) return false
  if ((stage.done || 0) >= stage.total) return true
  if ((stage.done || 0) > 0) return 'partial'
  return false
}

export function GovernanceLineageTab({ lineage }: { lineage: LineageData | null }) {
  const [selected, setSelected] = useState<NodeKey | null>(null)

  if (!lineage) {
    return (
      <div className="text-sm text-ax-text-muted py-8 text-center">
        Select a project to view solution runtime lineage
      </div>
    )
  }

  const pipeline = lineage.solution_pipeline || {}
  const stagesByKey = Object.fromEntries(
    (pipeline.stages || []).map((s) => [STAGE_KEYS[s.stage || ''] || s.stage, s]),
  ) as Record<NodeKey, SolutionStage | undefined>

  const gov = lineage.governance || {}

  const nodes: FlowNode[] = [
    {
      key: 'ingestion',
      label: 'Data Ingestion',
      done: stageDone(stagesByKey.ingestion),
      short: stagesByKey.ingestion?.total ? `${stagesByKey.ingestion.total} steps` : 'Not run',
    },
    {
      key: 'eligibility',
      label: 'Eligibility',
      done: stageDone(stagesByKey.eligibility),
      short: stagesByKey.eligibility?.total ? `${stagesByKey.eligibility.done}/${stagesByKey.eligibility.total}` : 'Pending',
    },
    {
      key: 'quality',
      label: 'Qlik Quality',
      done: stageDone(stagesByKey.quality),
      short: stagesByKey.quality?.total ? `${stagesByKey.quality.done}/${stagesByKey.quality.total}` : 'Pending',
    },
    {
      key: 'candidates',
      label: 'Candidates',
      done: stageDone(stagesByKey.candidates),
      short: stagesByKey.candidates?.total ? `${stagesByKey.candidates.done}/${stagesByKey.candidates.total}` : 'Pending',
    },
    {
      key: 'semantic',
      label: 'Semantic Match',
      done: stageDone(stagesByKey.semantic),
      short: stagesByKey.semantic?.total
        ? `${stagesByKey.semantic.total} LLM calls`
        : `${gov.llm_calls || 0} LLM calls`,
    },
    {
      key: 'advisor',
      label: 'Migration Advisor',
      done: stageDone(stagesByKey.advisor),
      short: stagesByKey.advisor?.total ? `${stagesByKey.advisor.total} recommendations` : 'Pending',
    },
    {
      key: 'signoff',
      label: 'HITL Sign-off',
      done: stageDone(stagesByKey.signoff),
      short: stagesByKey.signoff?.total ? `${stagesByKey.signoff.done} decisions` : 'Awaiting reviewer',
    },
  ]

  const detailFor = (key: NodeKey) => {
    const stage = stagesByKey[key]
    const label = nodes.find((n) => n.key === key)?.label || key
    if (!stage?.total) {
      return {
        title: label,
        body: 'No solution runtime activity recorded yet. Run the application pipeline to populate this stage.',
      }
    }
    return {
      title: label,
      body: `${stage.done || 0} of ${stage.total} steps completed · ${stage.tokens || 0} tokens in this stage.`,
    }
  }

  const active = selected ? detailFor(selected) : null

  return (
    <div className="flex flex-col gap-4 min-h-0 flex-1 overflow-auto">
      <ExplanationBanner
        summary="Solution artifact chain from data load → disposition → human sign-off."
        explanation="Lineage tracks the monitored application's runtime pipeline — not ArkhitX dashboard or playbook setup activity. Stages appear when the solution logs pipeline steps and governed agent calls."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 ax-panel-pad">
          <h3 className="ax-section-title mb-4">Solution flow</h3>
          <div className="flex flex-wrap items-center gap-2">
            {nodes.map((node, idx) => {
              const { Icon, color } = nodeStatus(node.done)
              const isSelected = selected === node.key
              return (
                <div key={node.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(node.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 px-3 py-2 rounded-lg border min-w-[100px] transition-colors',
                      color,
                      isSelected && 'ring-2 ring-ax-primary/50',
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">{node.label}</span>
                    <span className="text-[9px] text-ax-text-muted">{node.short}</span>
                  </button>
                  {idx < nodes.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-ax-text-muted shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="ax-panel-pad min-h-[160px]">
          <h3 className="ax-section-title mb-2">Stage detail</h3>
          {active ? (
            <div>
              <div className="text-sm font-medium mb-2">{active.title}</div>
              <div className="text-xs text-ax-text-dim leading-relaxed">{active.body}</div>
            </div>
          ) : (
            <p className="text-xs text-ax-text-muted">Click a stage to inspect solution runtime activity.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="ax-panel-pad">
          <div className="text-ax-text-muted">Pipeline steps</div>
          <div className="text-lg font-bold mt-1">{pipeline.summary?.total_steps ?? 0}</div>
        </div>
        <div className="ax-panel-pad">
          <div className="text-ax-text-muted">Avg grounding</div>
          <div className="text-lg font-bold mt-1">
            {gov.grounding_avg != null ? gov.grounding_avg.toFixed(2) : '—'}
          </div>
        </div>
        <div className="ax-panel-pad">
          <div className="text-ax-text-muted">Solution LLM calls</div>
          <div className="text-lg font-bold mt-1">{gov.llm_calls ?? 0}</div>
        </div>
        <div className="ax-panel-pad">
          <div className="text-ax-text-muted">Solution tokens</div>
          <div className="text-lg font-bold mt-1">{gov.total_tokens ?? pipeline.summary?.total_tokens ?? 0}</div>
        </div>
      </div>
    </div>
  )
}
