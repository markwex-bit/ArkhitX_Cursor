import { Fragment, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  MoreHorizontal,
  XCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import type { PipelineOverview, PipelineTimelineRow } from '../../types'
import { ScrollArea } from '../ui/ScrollArea'
import { PipelineStepHistoryDrawer } from './PipelineStepHistoryDrawer'

const STEP_TYPE_STYLES: Record<string, string> = {
  LLM: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  'Gate + HITL': 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  Manual: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  System: 'bg-ax-bg-3 text-ax-text-muted border-ax-border',
  Pipeline: 'bg-ax-primary/15 text-ax-primary-light border-ax-primary/30',
  'File I/O': 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
  'Rule Check': 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  'LLM Retry': 'bg-violet-500/10 text-violet-200 border-violet-500/25',
}

function formatConfidence(conf: number | null | undefined, grounding: number | null | undefined): string {
  const v = conf ?? grounding
  if (v == null || v === 0) return '—'
  const pct = v <= 1 ? Math.round(v * 100) : Math.round(v)
  return `${pct}%`
}

function StatusCell({ status }: { status: string }) {
  if (status === 'completed')
    return <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" aria-label="Completed" />
  if (status === 'running' || status === 'started')
    return <Loader2 className="w-4 h-4 text-ax-primary-light animate-spin mx-auto" aria-label="Running" />
  if (status === 'failed' || status === 'rejected')
    return <XCircle className="w-4 h-4 text-ax-red mx-auto" aria-label="Failed" />
  return <MoreHorizontal className="w-4 h-4 text-ax-text-muted mx-auto" aria-label="Pending" />
}

function StepTypeBadge({ type }: { type: string }) {
  const style = STEP_TYPE_STYLES[type] || STEP_TYPE_STYLES.System
  return (
    <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-semibold shrink-0', style)}>
      {type}
    </span>
  )
}

function PipelineRow({
  row,
  stepNum,
  onHistory,
}: {
  row: PipelineTimelineRow
  stepNum: number
  onHistory: (row: PipelineTimelineRow) => void
}) {
  const hasHistory = (row.history?.length ?? 0) > 0

  return (
    <tr className="border-b border-ax-border/30 hover:bg-ax-bg-3/50 group">
      <td className="px-2 py-1.5 font-mono text-[11px] font-bold text-ax-primary-light w-14 align-middle">
        {row.agent}
      </td>
      <td className="px-2 py-1.5 text-[10px] text-ax-text-muted w-8 text-center align-middle">{stepNum}</td>
      <td className="px-2 py-1.5 align-middle min-w-[280px] max-w-md">
        <div className="flex items-center gap-2">
          <StepTypeBadge type={row.step_type} />
          <span className="text-[11px] text-ax-text leading-snug truncate" title={row.step_name}>
            {row.step_name}
          </span>
        </div>
      </td>
      <td className="px-2 py-1.5 w-12 align-middle text-center">
        <StatusCell status={row.status} />
      </td>
      <td className="px-2 py-1.5 font-mono text-[11px] text-ax-text w-20 text-right align-middle whitespace-nowrap">
        {row.tokens_total != null && row.tokens_total > 0 ? row.tokens_total.toLocaleString() : '—'}
      </td>
      <td
        className="px-2 py-1.5 text-[11px] text-ax-text-dim align-middle max-w-[280px] truncate"
        title={row.output_summary || row.error_message || ''}
      >
        {row.output_summary || row.error_message || '—'}
      </td>
      <td className="px-2 py-1.5 font-mono text-[11px] text-ax-text w-14 text-right align-middle">
        {formatConfidence(row.confidence, row.grounding_score)}
      </td>
      <td className="px-2 py-1.5 font-mono text-[11px] text-ax-text-muted w-20 text-right align-middle whitespace-nowrap">
        {row.duration_ms != null ? `${row.duration_ms.toLocaleString()}ms` : '—'}
      </td>
      <td className="px-2 py-1.5 w-10 align-middle text-center">
        <button
          type="button"
          onClick={() => onHistory(row)}
          className={cn(
            'p-1 rounded hover:bg-ax-bg-4 transition-colors',
            hasHistory ? 'text-ax-primary-light' : 'text-ax-text-muted opacity-40',
          )}
          title={hasHistory ? `${row.history!.length} prior run(s)` : 'No prior runs'}
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

export function PipelineOverviewTable({
  overview,
  loading,
  pendingGateCount = 0,
}: {
  overview: PipelineOverview | null
  loading?: boolean
  pendingGateCount?: number
}) {
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({})
  const [historyRow, setHistoryRow] = useState<PipelineTimelineRow | null>(null)

  const isStageOpen = (stage: string) => collapsedStages[stage] !== true

  if (loading) {
    return (
      <div className="ax-panel flex items-center justify-center py-20 text-sm text-ax-text-muted">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading pipeline…
      </div>
    )
  }

  if (!overview || overview.rows.length === 0) {
    return (
      <div className="ax-panel overflow-hidden">
        <div className="ax-panel-header">Pipeline Overview</div>
        <div className="text-center py-16 px-4 text-sm text-ax-text-muted">
          <p>No pipeline activity recorded for this project yet.</p>
          <p className="text-[10px] mt-2 max-w-lg mx-auto leading-relaxed">
            Steps appear when the solution runs governed agents or calls{' '}
            <code className="font-mono text-ax-primary-light">log_pipeline_step()</code> with stage, process_group,
            step_name, and output summary.
          </p>
        </div>
      </div>
    )
  }

  const s = overview.summary

  return (
    <>
      <div className="ax-panel overflow-hidden flex flex-col min-h-0 flex-1">
        <div className="px-4 py-2.5 border-b border-ax-border bg-ax-bg-2 flex items-center justify-between gap-4 flex-wrap">
          <span className="text-[11px] font-bold uppercase tracking-widest text-ax-text">Pipeline Overview</span>
          <div className="flex items-center gap-4 text-[11px] text-ax-text-muted">
            <span>
              <strong className="text-ax-text">{s.completed}</strong>/{s.total_steps} done
            </span>
            {s.running > 0 && (
              <span className="text-ax-primary-light">
                <strong>{s.running}</strong> running
              </span>
            )}
            {s.gates_passed != null && s.gates_passed > 0 && (
              <span>
                Gates: <strong className="text-emerald-400">{s.gates_passed}✓</strong>
              </span>
            )}
            {pendingGateCount > 0 && (
              <span className="text-ax-gate-text">
                <strong>{pendingGateCount}</strong> pending gate{pendingGateCount !== 1 ? 's' : ''}
              </span>
            )}
            <span>
              Tokens: <strong className="text-ax-text">{s.total_tokens.toLocaleString()}</strong>
            </span>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-[420px] max-h-[calc(100vh-220px)]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-ax-bg-3 border-b border-ax-border">
              <tr className="text-[9px] uppercase tracking-wider text-ax-text-muted">
                <th className="px-2 py-2 font-semibold w-14">Agent</th>
                <th className="px-2 py-2 font-semibold w-8 text-center">#</th>
                <th className="px-2 py-2 font-semibold">Step</th>
                <th className="px-2 py-2 font-semibold w-12 text-center">Status</th>
                <th className="px-2 py-2 font-semibold w-20 text-right">Tokens</th>
                <th className="px-2 py-2 font-semibold">Output</th>
                <th className="px-2 py-2 font-semibold w-14 text-right">Conf.</th>
                <th className="px-2 py-2 font-semibold w-20 text-right">Time</th>
                <th className="px-2 py-2 font-semibold w-10" aria-label="History" />
              </tr>
            </thead>
            <tbody>
              {overview.stages.map((group, stageIdx) => {
                const open = isStageOpen(group.stage)
                let stepInStage = 0
                let lastProcessGroup = ''

                return (
                  <Fragment key={group.stage}>
                    <tr
                      className="bg-ax-primary/10 border-y border-ax-primary/20 cursor-pointer hover:bg-ax-primary/15"
                      onClick={() =>
                        setCollapsedStages((prev) => ({ ...prev, [group.stage]: open }))
                      }
                    >
                      <td colSpan={9} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {open ? (
                            <ChevronDown className="w-3.5 h-3.5 text-ax-primary-light shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-ax-primary-light shrink-0" />
                          )}
                          <span className="text-[10px] font-bold uppercase tracking-wide text-ax-primary-light">
                            Stage {stageIdx + 1}: {group.stage}
                          </span>
                          <span className="text-[10px] text-ax-text-muted ml-auto font-mono flex items-center gap-3">
                            {group.tokens > 0 && <span>{group.tokens.toLocaleString()} tok</span>}
                            <span>
                              {group.done}/{group.total}
                            </span>
                          </span>
                        </div>
                      </td>
                    </tr>
                    {open &&
                      group.rows.map((row) => {
                        stepInStage += 1
                        const showGroupHeader =
                          row.process_group && row.process_group !== lastProcessGroup
                        if (showGroupHeader) lastProcessGroup = row.process_group!

                        return (
                          <Fragment key={row.id}>
                            {showGroupHeader && (
                              <tr className="bg-ax-bg-2/80">
                                <td colSpan={9} className="px-4 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <Circle className="w-2 h-2 fill-ax-primary-light text-ax-primary-light" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-ax-text">
                                      {row.process_group}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <PipelineRow
                              row={row}
                              stepNum={stepInStage}
                              onHistory={setHistoryRow}
                            />
                          </Fragment>
                        )
                      })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      <PipelineStepHistoryDrawer row={historyRow} onClose={() => setHistoryRow(null)} />
    </>
  )
}
