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
    <div className="space-y-2">
      {dispositions.map((d) => (
        <div key={d.qlik_app_id} className="ax-panel overflow-hidden">
          <div className="ax-panel-toolbar py-1.5">
            <span className="ax-panel-toolbar-title normal-case tracking-wide truncate max-w-[70%]">
              {d.qlik_app_name}
            </span>
            {d.disposition && <Badge tone={d.disposition}>{d.disposition}</Badge>}
          </div>

          {d.candidates.length === 0 ? (
            <p className="ax-panel-body text-[11px] text-ax-text-muted italic">
              No candidates — genuine Rebuild case (no shared lineage or overlap).
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="ax-table">
                <thead>
                  <tr>
                    <th>Power BI candidate</th>
                    <th>Workspace</th>
                    <th>Conf.</th>
                    <th>Lineage</th>
                    <th>Semantic</th>
                  </tr>
                </thead>
                <tbody>
                  {d.candidates.map((c) => {
                    const key = `${d.qlik_app_id}::${c.pbi_dataset_id}`
                    return (
                      <tr
                        key={key}
                        onClick={() => onSelectCandidate(d, c)}
                        className={`cursor-pointer ${
                          selectedCandidateId === key ? 'bg-ax-primary/10' : ''
                        }`}
                      >
                        <td className="font-medium">{c.pbi_name}</td>
                        <td className="text-ax-text-dim">{c.pbi_workspace_name}</td>
                        <td>
                          <Badge tone={c.confidence_tier}>{c.confidence_tier}</Badge>
                        </td>
                        <td className="text-ax-text-dim">
                          {c.lineage_match ? (
                            <span className="text-ax-green">✓ shared</span>
                          ) : (
                            <span className="text-ax-text-muted">none</span>
                          )}
                        </td>
                        <td className="text-ax-text-dim font-mono tabular-nums">
                          {c.semantic_score !== null ? (
                            `${c.semantic_score}`
                          ) : (
                            <span className="text-ax-text-muted italic font-sans">
                              {c.llm_used === false ? 'n/a' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
