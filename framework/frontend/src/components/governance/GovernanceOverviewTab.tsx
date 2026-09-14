import { PipelineOverviewTable } from './PipelineOverviewTable'
import type { PipelineOverview } from '../../types'

export function GovernanceOverviewTab({
  pipelineOverview,
  pendingGateCount,
  loading,
}: {
  pipelineOverview: PipelineOverview | null
  pendingGateCount: number
  loading?: boolean
}) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <PipelineOverviewTable
        overview={pipelineOverview}
        loading={loading}
        pendingGateCount={pendingGateCount}
      />
    </div>
  )
}
