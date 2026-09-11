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
  'pbi-only': 'Power BI only',
}

const SHARED_CLASSES: Record<Shared, string> = {
  shared: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'qlik-only': 'bg-sky-100 text-sky-800 border-sky-300',
  'pbi-only': 'bg-violet-100 text-violet-800 border-violet-300',
}

function SharedBadge({ shared }: { shared: Shared }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${SHARED_CLASSES[shared]}`}
    >
      {SHARED_LABEL[shared]}
    </span>
  )
}

// Every row is a platform-agnostic metadata *concept*. Qlik and Power BI express it
// differently (or, for a few rows, one platform has no equivalent at all) — that's
// exactly what the "Shared?" badge is for. This is independent of the current sample
// data / ingestion model — see PHASE-0-BUILD.md for what's actually wired today.
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
    qlik: 'description, tags, customProperties (QRS)',
    powerBi: 'description, sensitivityLabel, endorsement — Certified/Promoted (Scanner API)',
    shared: 'shared',
  },
  {
    concept: 'Data connections / source pointers',
    qlik: "dataConnections[].name (QRS) — name only, not guaranteed to map to actual app usage",
    powerBi: 'datasourceUsages[] — connection type + server/database/path (Scanner API)',
    shared: 'shared',
  },
  {
    concept: 'Transformation / business logic',
    qlik: 'Load script — full ETL logic, joins, source SQL (Engine API only)',
    powerBi: 'Power Query M — full transformation logic (Scanner API, datasetExpressions=true)',
    shared: 'shared',
  },
  {
    concept: 'Calculations (measures/dimensions)',
    qlik: 'Master items — names via QRS; full expression requires Engine API',
    powerBi: 'Measures — name + full DAX expression, both via Scanner API',
    shared: 'shared',
  },
  {
    concept: 'Data model (tables/fields/relationships)',
    qlik: 'Tables, fields, associations, synthetic keys — Engine API only',
    powerBi: 'Tables, columns, relationships (cardinality, cross-filter direction) — Scanner API',
    shared: 'shared',
  },
  {
    concept: 'Row-level security',
    qlik: 'Section Access — defined in load script; not exposed via QRS/Engine metadata calls',
    powerBi: 'RLS roles — role name + DAX filter expression (isEffectiveIdentityRequired) — Scanner API',
    shared: 'shared',
  },
  {
    concept: 'Visual / report layer',
    qlik: 'Sheets — titles via QRS; full visual definitions require Engine API',
    powerBi: 'Reports — id/name/dataset binding via Scanner API; page/visual detail needs separate Report API',
    shared: 'shared',
  },
  {
    concept: 'Scheduling & refresh operations',
    qlik: 'Reload tasks — schedule, trigger chains, execution status/duration (QRS)',
    powerBi: 'Refresh schedule + history — enabled/days/times + per-run success/failure (Scanner + REST API)',
    shared: 'shared',
  },
  {
    concept: 'Access & permissions',
    qlik: 'Stream access rules, custom security rules (QRS)',
    powerBi: 'Workspace role assignments, sharing links (REST API)',
    shared: 'shared',
  },
  {
    concept: 'Usage / activity telemetry',
    qlik: 'Session counts, active users — monitoring apps / License API (separate from QRS)',
    powerBi: 'View/edit/share/export events per user per artifact — Activity Events API (separate from Scanner)',
    shared: 'shared',
  },
  {
    concept: 'Resource usage / performance',
    qlik: 'RAM consumption, calc time, load duration — Engine API',
    powerBi: 'Refresh duration, memory — Premium/Fabric Capacity Metrics app (separate from Scanner)',
    shared: 'shared',
  },
  {
    concept: 'Storage / query mode',
    qlik: 'N/A — Qlik apps are in-memory (or Direct Discovery); no equivalent mode metadata field',
    powerBi: 'storageMode — Import / DirectQuery / Composite / LiveConnection (Scanner API)',
    shared: 'pbi-only',
  },
  {
    concept: 'Cross-artifact lineage chains',
    qlik: 'No structured multi-hop lineage exposed — QVD chaining exists but is not API-visible as lineage',
    powerBi: 'Dataflows + upstream dataset/dataflow lineage (Scanner API, lineage=true)',
    shared: 'pbi-only',
  },
  {
    concept: 'On-prem gateway / connectivity infra',
    qlik: 'N/A — Qlik Sense Enterprise typically connects directly; no gateway-mapping metadata',
    powerBi: 'On-prem data gateway cluster mapping per datasource (Admin API)',
    shared: 'pbi-only',
  },
  {
    concept: 'File / app size',
    qlik: 'fileSize — QVF app size in bytes (QRS)',
    powerBi: 'Not typically returned by Scanner API — storageMode is the closest proxy',
    shared: 'qlik-only',
  },
  {
    concept: 'Content library assets',
    qlik: 'Content library — images/assets referenced by app objects (QRS)',
    powerBi: 'No equivalent concept in Scanner API',
    shared: 'qlik-only',
  },
]

export default function MetadataReference() {
  const sharedCount = ROWS.filter((r) => r.shared === 'shared').length
  const qlikOnlyCount = ROWS.filter((r) => r.shared === 'qlik-only').length
  const pbiOnlyCount = ROWS.filter((r) => r.shared === 'pbi-only').length

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Qlik Sense vs. Power BI — full metadata comparison
        </h3>
        <p className="text-xs text-gray-500">
          Every metadata concept either platform's admin/metadata APIs can expose, side by
          side. This is a platform capability comparison — independent of what the current
          sample data captures (see the Eligibility/Quality/Match tabs for that). Full detail:{' '}
          <code className="text-gray-600">docs/METADATA-CAPTURE-REFERENCE.md</code>.
        </p>
        <div className="flex gap-3 mt-3">
          <SharedBadge shared="shared" />
          <span className="text-xs text-gray-500 self-center">{sharedCount} concepts exist on both platforms</span>
        </div>
        <div className="flex gap-3 mt-2">
          <SharedBadge shared="qlik-only" />
          <span className="text-xs text-gray-500 self-center">{qlikOnlyCount} exist only in Qlik</span>
        </div>
        <div className="flex gap-3 mt-2">
          <SharedBadge shared="pbi-only" />
          <span className="text-xs text-gray-500 self-center">{pbiOnlyCount} exist only in Power BI</span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="pb-2 pr-4 w-56">Metadata concept</th>
              <th className="pb-2 pr-4 bg-sky-50/60">Qlik Sense</th>
              <th className="pb-2 pr-4 bg-violet-50/60">Power BI</th>
              <th className="pb-2 w-28">Shared?</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.concept} className="border-b border-gray-50 align-top">
                <td className="py-2 pr-4 font-medium text-gray-800">{row.concept}</td>
                <td className="py-2 pr-4 text-gray-600 bg-sky-50/30">
                  {row.shared === 'pbi-only' ? (
                    <span className="text-gray-400 italic">{row.qlik}</span>
                  ) : (
                    row.qlik
                  )}
                </td>
                <td className="py-2 pr-4 text-gray-600 bg-violet-50/30">
                  {row.shared === 'qlik-only' ? (
                    <span className="text-gray-400 italic">{row.powerBi}</span>
                  ) : (
                    row.powerBi
                  )}
                </td>
                <td className="py-2">
                  <SharedBadge shared={row.shared} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          Platform-specific concepts (no direct equivalent)
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          These aren't gaps to fill — they're genuine architecture differences between the two
          platforms. Worth flagging during migration risk assessment since there's nothing to
          map them to on the other side.
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>
            <span className="font-medium text-gray-800">Power BI only:</span> storage/query mode,
            cross-artifact lineage chains (dataflows), on-prem gateway mapping
          </li>
          <li>
            <span className="font-medium text-gray-800">Qlik only:</span> app file size, content
            library assets
          </li>
        </ul>
      </div>
    </div>
  )
}
