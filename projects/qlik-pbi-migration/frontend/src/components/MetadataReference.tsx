import type { ParityRow } from '../types'
import { DataTable } from './ui/DataTable'

type Shared = 'shared' | 'qlik-only' | 'pbi-only'

interface ConceptRow {
  concept: string
  qlik: string
  powerBi: string
  shared: Shared
}

const SHARED_LABEL: Record<Shared, string> = {
  shared: 'Shared',
  'qlik-only': 'Qlik only',
  'pbi-only': 'PBI only',
}

const SHARED_CLASSES: Record<Shared, string> = {
  shared: 'ax-badge-ok',
  'qlik-only': 'ax-badge-qlik',
  'pbi-only': 'ax-badge-pbi',
}

function SharedBadge({ shared }: { shared: Shared }) {
  return <span className={`whitespace-nowrap ${SHARED_CLASSES[shared]}`}>{SHARED_LABEL[shared]}</span>
}

const ROWS: ConceptRow[] = [
  {
    concept: 'Identity & ownership',
    qlik: 'App id, name, owner, stream (QRS)',
    powerBi: 'Dataset id, name, configuredBy, workspace (Scanner API)',
    shared: 'shared',
  },
  {
    concept: 'Lifecycle timestamps',
    qlik: 'createdDate, modifiedDate, lastReloadTime (QRS)',
    powerBi: 'createdDate, refresh history lastRefreshTime (Scanner + REST API)',
    shared: 'shared',
  },
  {
    concept: 'Description & classification',
    qlik: 'description, tags (QRS)',
    powerBi: 'description, endorsement (Scanner API)',
    shared: 'shared',
  },
  {
    concept: 'Data source / lineage',
    qlik: 'connections, script lines (Engine API)',
    powerBi: 'datasources, upstreamDataflows (Scanner API)',
    shared: 'shared',
  },
  {
    concept: 'Refresh / reload metadata',
    qlik: 'lastReloadTime, reload status (QRS)',
    powerBi: 'refreshSchedule, refresh history (Scanner + REST API)',
    shared: 'shared',
  },
  {
    concept: 'Table/column-level lineage',
    qlik: 'Partial — script parsing only',
    powerBi: 'Yes — Scanner API lineage section',
    shared: 'shared',
  },
  {
    concept: 'Measure / DAX expression',
    qlik: 'Yes — Engine API',
    powerBi: 'Yes — Scanner API expressions',
    shared: 'shared',
  },
  {
    concept: 'Sheet / visual content',
    qlik: 'Yes — Engine API object tree',
    powerBi: 'Yes — Scanner API reports section',
    shared: 'shared',
  },
  {
    concept: 'Row-level security (RLS)',
    qlik: 'Yes — section access in script (Engine API)',
    powerBi: 'Yes — roles in Scanner API',
    shared: 'shared',
  },
  {
    concept: 'Sensitivity labels',
    qlik: 'No direct equivalent in QRS',
    powerBi: 'Yes — Microsoft Information Protection labels',
    shared: 'pbi-only',
  },
  {
    concept: 'Certification / endorsement tier',
    qlik: 'Published flag, stream membership',
    powerBi: 'EndorsementDetails (promoted/certified)',
    shared: 'shared',
  },
  {
    concept: 'Storage / query mode',
    qlik: 'In-memory vs on-disk (Engine API)',
    powerBi: 'Import / DirectQuery / Composite (Scanner API)',
    shared: 'shared',
  },
  {
    concept: 'App file size',
    qlik: 'Yes — QRS file size metadata',
    powerBi: 'No direct equivalent',
    shared: 'qlik-only',
  },
  {
    concept: 'On-prem gateway mapping',
    qlik: 'N/A (Qlik uses connectors)',
    powerBi: 'Yes — gateway datasource bindings',
    shared: 'pbi-only',
  },
]

export default function MetadataReference() {
  const sharedCount = ROWS.filter((r) => r.shared === 'shared').length
  const qlikOnlyCount = ROWS.filter((r) => r.shared === 'qlik-only').length
  const pbiOnlyCount = ROWS.filter((r) => r.shared === 'pbi-only').length

  return (
    <div className="space-y-3">
      <div className="ax-panel overflow-hidden">
        <div className="ax-panel-toolbar">
          <span className="ax-panel-toolbar-title">Metadata comparison</span>
          <div className="ax-panel-toolbar-meta">
            <span>
              <strong className="text-ax-green">{sharedCount}</strong> shared
            </span>
            <span>
              <strong className="text-ax-blue">{qlikOnlyCount}</strong> Qlik-only
            </span>
            <span>
              <strong className="text-ax-accent">{pbiOnlyCount}</strong> PBI-only
            </span>
          </div>
        </div>
        <p className="px-3 py-2 text-[10px] text-ax-text-muted border-b border-ax-border leading-relaxed">
          Platform capability comparison — independent of sample data. See{' '}
          <code className="ax-code">docs/METADATA-CAPTURE-REFERENCE.md</code>.
        </p>
        <div className="p-2">
          <DataTable
            rows={ROWS}
            rowKey={(r) => r.concept}
            maxHeight="calc(100vh - 260px)"
            columns={[
              {
                key: 'concept',
                header: 'Concept',
                className: 'whitespace-nowrap font-medium',
                render: (r) => r.concept,
              },
              {
                key: 'qlik',
                header: 'Qlik Sense',
                render: (r) => (
                  <span className={r.shared === 'pbi-only' ? 'text-ax-text-muted italic' : 'text-ax-text-dim'}>
                    {r.qlik}
                  </span>
                ),
              },
              {
                key: 'pbi',
                header: 'Power BI',
                render: (r) => (
                  <span className={r.shared === 'qlik-only' ? 'text-ax-text-muted italic' : 'text-ax-text-dim'}>
                    {r.powerBi}
                  </span>
                ),
              },
              {
                key: 'shared',
                header: 'Shared?',
                render: (r) => <SharedBadge shared={r.shared} />,
              },
            ]}
          />
        </div>
      </div>

      {parityMatrix.length > 0 && (
        <div className="ax-panel overflow-hidden">
          <div className="ax-panel-toolbar">
            <span className="ax-panel-toolbar-title">API capability parity</span>
          </div>
          <div className="p-2">
            <DataTable
              rows={parityMatrix}
              rowKey={(r) => r.capability}
              maxHeight="min(320px, calc(100vh - 280px))"
              columns={[
                {
                  key: 'capability',
                  header: 'Capability',
                  render: (r) => <span className="font-medium">{r.capability}</span>,
                },
                { key: 'qlik', header: 'Qlik', render: (r) => <span className="text-ax-text-dim">{r.qlik}</span> },
                {
                  key: 'pbi',
                  header: 'Power BI',
                  render: (r) => <span className="text-ax-text-dim">{r.power_bi}</span>,
                },
                { key: 'note', header: 'Note', render: (r) => <span className="text-ax-text-muted">{r.note}</span> },
              ]}
            />
          </div>
        </div>
      )}
    </div>
  )
}
