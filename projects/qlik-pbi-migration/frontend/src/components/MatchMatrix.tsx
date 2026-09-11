import type { MatchCandidate, QlikDispositionResult } from '../types'
import Badge from './Badge'

export default function MatchMatrix({
  dispositions,
  onSelectCandidate,
  selectedCandidateId,
}: {
  dispositions: QlikDispositionResult[]
  onSelectCandidate: (qlikApp: QlikDispositionResult, candidate: MatchCandidate) => void
  selectedCandidateId?: string
}) {
  return (
    <div className="space-y-6">
      {dispositions.map((d) => (
        <div key={d.qlik_app_id} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">{d.qlik_app_name}</h3>
            {d.disposition && <Badge tone={d.disposition}>{d.disposition}</Badge>}
          </div>

          {d.candidates.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No candidates survived eligibility filtering + blocking. This is a genuine
              Rebuild case — no Power BI asset shares data lineage, naming, or measure overlap
              with this app.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2">Power BI candidate</th>
                  <th className="pb-2">Workspace</th>
                  <th className="pb-2">Confidence</th>
                  <th className="pb-2">Lineage</th>
                  <th className="pb-2">Semantic score</th>
                </tr>
              </thead>
              <tbody>
                {d.candidates.map((c) => {
                  const key = `${d.qlik_app_id}::${c.pbi_dataset_id}`
                  return (
                    <tr
                      key={key}
                      onClick={() => onSelectCandidate(d, c)}
                      className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${
                        selectedCandidateId === key ? 'bg-blue-50' : ''
                      }`}
                    >
                      <td className="py-2 font-medium text-gray-800">{c.pbi_name}</td>
                      <td className="py-2 text-gray-600">{c.pbi_workspace_name}</td>
                      <td className="py-2">
                        <Badge tone={c.confidence_tier}>{c.confidence_tier}</Badge>
                      </td>
                      <td className="py-2 text-gray-600">
                        {c.lineage_match ? (
                          <span className="text-emerald-700">✓ shared connection</span>
                        ) : (
                          <span className="text-gray-400">none identified</span>
                        )}
                      </td>
                      <td className="py-2 text-gray-600">
                        {c.semantic_score !== null ? (
                          `${c.semantic_score}/100`
                        ) : (
                          <span className="text-gray-400 italic">
                            {c.llm_used === false ? 'not scored' : 'not run'}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
