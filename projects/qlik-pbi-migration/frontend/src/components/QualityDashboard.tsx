import type { ParityRow, QlikQualityResult } from '../types'
import Badge from './Badge'
import { DataTable } from './ui/DataTable'

export default function QualityDashboard({
  qlikQuality,
  parityMatrix,
}: {
  qlikQuality: QlikQualityResult[]
  parityMatrix: ParityRow[]
}) {
  return (
    <div className="space-y-3">
      <div className="ax-panel overflow-hidden">
        <div className="ax-panel-toolbar">
          <span className="ax-panel-toolbar-title">Qlik quality pass</span>
          <div className="ax-panel-toolbar-meta">
            <span>{qlikQuality.length} apps</span>
          </div>
        </div>
        <div className="p-2">
          <DataTable
            rows={qlikQuality}
            rowKey={(q) => q.app_id}
            maxHeight="min(280px, calc(100vh - 320px))"
            columns={[
              {
                key: 'app',
                header: 'App',
                render: (q) => <span className="font-medium">{q.name}</span>,
              },
              {
                key: 'score',
                header: 'Completeness',
                render: (q) => (
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <div className="flex-1 bg-ax-bg-3 rounded h-1.5 overflow-hidden max-w-[96px]">
                      <div
                        className={`h-1.5 ${
                          q.completeness_score >= 0.75
                            ? 'bg-ax-green'
                            : q.completeness_score >= 0.5
                              ? 'bg-ax-amber'
                              : 'bg-ax-red'
                        }`}
                        style={{ width: `${q.completeness_score * 100}%` }}
                      />
                    </div>
                    <span className="text-ax-text-dim tabular-nums font-mono">
                      {q.completeness_score.toFixed(2)}
                    </span>
                  </div>
                ),
              },
              {
                key: 'flags',
                header: 'Flags',
                render: (q) =>
                  q.flags.length === 0 ? (
                    <span className="text-ax-text-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-0.5">
                      {q.flags.map((f) => (
                        <Badge key={f} tone="Medium">
                          {f.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  ),
              },
            ]}
          />
        </div>
      </div>

      <div className="ax-panel overflow-hidden">
        <div className="ax-panel-toolbar">
          <span className="ax-panel-toolbar-title">Platform parity matrix</span>
          <div className="ax-panel-toolbar-meta">
            <span>{parityMatrix.length} capabilities</span>
          </div>
        </div>
        <div className="p-2">
          <DataTable
            rows={parityMatrix}
            rowKey={(r) => r.capability}
            maxHeight="min(360px, calc(100vh - 280px))"
            columns={[
              {
                key: 'capability',
                header: 'Capability',
                className: 'whitespace-nowrap',
                render: (r) => <span className="font-medium">{r.capability}</span>,
              },
              {
                key: 'qlik',
                header: 'Qlik (QRS)',
                render: (r) => <span className="text-ax-text-dim">{r.qlik}</span>,
              },
              {
                key: 'pbi',
                header: 'Power BI',
                render: (r) => <span className="text-ax-text-dim">{r.power_bi}</span>,
              },
              {
                key: 'note',
                header: 'Note',
                render: (r) => <span className="text-ax-text-muted">{r.note}</span>,
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
