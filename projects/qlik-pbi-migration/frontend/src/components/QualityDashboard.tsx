import type { ParityRow, QlikQualityResult } from '../types'
import Badge from './Badge'

export default function QualityDashboard({
  qlikQuality,
  parityMatrix,
}: {
  qlikQuality: QlikQualityResult[]
  parityMatrix: ParityRow[]
}) {
  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Qlik inventory quality pass
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Completeness score (0–1) and flags per Qlik app, computed deterministically from
          field-level availability — same logic as the Power BI eligibility filter, scaled to
          this side of the estate.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-2">App</th>
              <th className="pb-2">Completeness</th>
              <th className="pb-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {qlikQuality.map((q) => (
              <tr key={q.app_id} className="border-b border-gray-50">
                <td className="py-2 font-medium text-gray-800">{q.name}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-100 rounded h-2 overflow-hidden">
                      <div
                        className={`h-2 ${
                          q.completeness_score >= 0.75
                            ? 'bg-emerald-400'
                            : q.completeness_score >= 0.5
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                        }`}
                        style={{ width: `${q.completeness_score * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-600">{q.completeness_score.toFixed(2)}</span>
                  </div>
                </td>
                <td className="py-2">
                  {q.flags.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {q.flags.map((f) => (
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
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Cross-platform capability parity matrix
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          What's even obtainable from each platform's admin API — a structural finding, not a
          per-app data-quality bug. See docs/DATA-SCHEMAS.md for the full provenance of each row.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-2 pr-4">Capability</th>
              <th className="pb-2 pr-4">Qlik (QRS)</th>
              <th className="pb-2 pr-4">Power BI (Scanner API)</th>
              <th className="pb-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {parityMatrix.map((row) => (
              <tr key={row.capability} className="border-b border-gray-50 align-top">
                <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">
                  {row.capability}
                </td>
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{row.qlik}</td>
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{row.power_bi}</td>
                <td className="py-2 text-gray-500">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
