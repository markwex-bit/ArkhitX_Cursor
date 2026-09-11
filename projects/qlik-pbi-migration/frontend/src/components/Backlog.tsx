import type { BacklogEntry } from '../types'
import Badge from './Badge'
import { backlogCsvUrl } from '../services/api'

export default function Backlog({ entries }: { entries: BacklogEntry[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Migration backlog</h3>
          <p className="text-xs text-gray-500">
            Only Qlik apps with a "confirmed" sign-off appear here — overrides and
            "needs more info" are tracked but excluded until resolved.
          </p>
        </div>
        <a
          href={backlogCsvUrl}
          className="text-sm bg-gray-800 hover:bg-gray-900 text-white px-3 py-1.5 rounded"
        >
          Export CSV
        </a>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 italic">
          No confirmed sign-offs yet. Go to the Matches tab, select a candidate, and submit a
          sign-off to populate the backlog.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-2">Qlik app</th>
              <th className="pb-2">Power BI target</th>
              <th className="pb-2">Disposition</th>
              <th className="pb-2">Confidence</th>
              <th className="pb-2">Effort</th>
              <th className="pb-2">Reviewer</th>
              <th className="pb-2">When</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="py-2 font-medium text-gray-800">{e.qlik_app_name}</td>
                <td className="py-2 text-gray-600">{e.pbi_name ?? '—'}</td>
                <td className="py-2">
                  {e.disposition ? <Badge tone={e.disposition}>{e.disposition}</Badge> : '—'}
                </td>
                <td className="py-2">
                  {e.confidence_tier ? (
                    <Badge tone={e.confidence_tier}>{e.confidence_tier}</Badge>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2 text-gray-600">{e.effort ?? '—'}</td>
                <td className="py-2 text-gray-600">{e.reviewer}</td>
                <td className="py-2 text-gray-500">
                  {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
