import type { BacklogEntry } from '../types'
import Badge from './Badge'
import { backlogCsvUrl } from '../services/api'
import { DataTable } from './ui/DataTable'

export default function Backlog({ entries }: { entries: BacklogEntry[] }) {
  return (
    <div className="ax-panel overflow-hidden flex flex-col min-h-0">
      <div className="ax-panel-toolbar">
        <span className="ax-panel-toolbar-title">Migration backlog</span>
        <div className="ax-panel-toolbar-meta">
          <span>
            <strong className="text-ax-text">{entries.length}</strong> confirmed
          </span>
          <a href={backlogCsvUrl} className="ax-btn-primary py-0.5 px-2">
            Export CSV
          </a>
        </div>
      </div>
      <div className="p-2">
        {entries.length === 0 ? (
          <p className="text-[11px] text-ax-text-muted italic py-6 text-center">
            No confirmed sign-offs. Select a match candidate and submit sign-off.
          </p>
        ) : (
          <DataTable
            rows={entries}
            rowKey={(e) => `${e.qlik_app_id}::${e.pbi_dataset_id ?? 'none'}`}
            maxHeight="calc(100vh - 240px)"
            columns={[
              {
                key: 'qlik',
                header: 'Qlik app',
                render: (e) => <span className="font-medium">{e.qlik_app_name}</span>,
              },
              {
                key: 'pbi',
                header: 'Power BI target',
                render: (e) => (
                  <span className="text-ax-text-dim">
                    {e.pbi_name ?? '—'}
                    {e.pbi_name && e.pbi_dataset_id ? (
                      <span className="text-ax-text-muted font-mono text-[10px] block">{e.pbi_dataset_id}</span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'disp',
                header: 'Disposition',
                render: (e) => (e.disposition ? <Badge tone={e.disposition}>{e.disposition}</Badge> : '—'),
              },
              {
                key: 'conf',
                header: 'Conf.',
                render: (e) =>
                  e.confidence_tier ? <Badge tone={e.confidence_tier}>{e.confidence_tier}</Badge> : '—',
              },
              {
                key: 'effort',
                header: 'Effort',
                render: (e) => <span className="text-ax-text-dim">{e.effort ?? '—'}</span>,
              },
              {
                key: 'reviewer',
                header: 'Reviewer',
                render: (e) => <span className="text-ax-text-dim">{e.reviewer}</span>,
              },
              {
                key: 'when',
                header: 'When',
                render: (e) => (
                  <span className="text-ax-text-muted font-mono text-[10px] whitespace-nowrap">
                    {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  )
}
