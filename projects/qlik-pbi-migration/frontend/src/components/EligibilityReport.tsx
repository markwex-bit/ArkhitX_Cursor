import type { EligibilitySummary } from '../types'
import Badge from './Badge'

const REASON_LABELS: Record<string, string> = {
  personal_workspace: 'Personal workspace',
  test_or_sandbox_name: 'Test / sandbox / copy naming',
  stale: 'Abandoned / stale (no refresh in 180+ days)',
  orphaned_dataset: 'Orphaned dataset (no report built on it)',
  broken_lineage: 'Broken lineage (no data source captured)',
  duplicate: 'Duplicate copy (collapsed to canonical)',
}

export default function EligibilityReport({ summary }: { summary: EligibilitySummary }) {
  const excluded = summary.results.filter((r) => !r.eligible)
  const eligible = summary.results.filter((r) => r.eligible)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Power BI apps scanned" value={summary.total} />
        <StatCard label="Eligible for matching" value={summary.eligible_count} tone="emerald" />
        <StatCard label="Excluded before matching" value={summary.excluded_count} tone="rose" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Exclusion reasons — aggregate counts, not per-app narrative
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Every reason below is a deterministic rule against structured metadata. No LLM is
          involved in this stage — see the "Deterministic vs. AI-agent boundary" note in the
          project docs.
        </p>
        <div className="space-y-2">
          {Object.entries(summary.by_reason)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => (
              <div key={reason} className="flex items-center gap-3">
                <div className="w-56 text-sm text-gray-700 flex-shrink-0">
                  {REASON_LABELS[reason] ?? reason}
                </div>
                <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                  <div
                    className="bg-rose-400 h-3"
                    style={{ width: `${Math.min(100, (count / summary.total) * 100)}%` }}
                  />
                </div>
                <div className="w-8 text-sm text-gray-600 text-right">{count}</div>
              </div>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Clean candidate pool ({eligible.length}) — the only apps that ever reach matching
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2">Name</th>
                <th className="pb-2">Workspace</th>
                <th className="pb-2">Quality flags</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((r) => (
                <tr key={r.dataset_id} className="border-b border-gray-50">
                  <td className="py-2 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2 text-gray-600">{r.workspace_name}</td>
                  <td className="py-2">
                    {r.quality_flags.length === 0 ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.quality_flags.map((f) => (
                          <Badge key={f} tone="Medium">
                            {f.replace(/_/g, ' ')}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Excluded ({excluded.length}) — never reach matching
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2">Name</th>
                <th className="pb-2">Workspace</th>
                <th className="pb-2">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {excluded.map((r) => (
                <tr key={r.dataset_id} className="border-b border-gray-50">
                  <td className="py-2 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2 text-gray-600">{r.workspace_name}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.exclusion_reasons.map((reason) => (
                        <Badge key={reason} tone="Low">
                          {reason.startsWith('duplicate_of:')
                            ? 'duplicate'
                            : REASON_LABELS[reason]?.split(' (')[0] ?? reason}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'emerald' | 'rose'
}) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-gray-800'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  )
}
