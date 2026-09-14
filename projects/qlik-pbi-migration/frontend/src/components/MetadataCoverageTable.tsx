import type { MetadataCoverageReport } from '../types'

function tierLabel(tier: string) {
  return tier === 'must_have' ? 'Must have' : 'High value'
}

export default function MetadataCoverageTable({ reports }: { reports: MetadataCoverageReport[] }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {reports.map((report) => (
        <div key={report.platform} className="ax-panel overflow-hidden">
          <div className="ax-panel-toolbar">
            <span className="ax-panel-toolbar-title">{report.platform} — field coverage</span>
            <span className="ax-panel-toolbar-meta">
              {report.total_apps} apps scanned
            </span>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="ax-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Tier</th>
                  <th className="text-right">Present</th>
                  <th className="text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {report.fields.map((f) => (
                  <tr key={f.field_key}>
                    <td className="text-ax-text-dim">{f.label}</td>
                    <td>
                      <span className={f.tier === 'must_have' ? 'ax-badge-warn' : 'ax-badge-muted'}>
                        {tierLabel(f.tier)}
                      </span>
                    </td>
                    <td className="text-right font-mono tabular-nums text-ax-text-dim">
                      {f.present_count}/{f.total}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      <span
                        className={
                          f.tier === 'must_have' && f.pct < 80
                            ? 'text-ax-amber'
                            : f.pct >= 90
                              ? 'text-ax-green'
                              : 'text-ax-text'
                        }
                      >
                        {f.pct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
