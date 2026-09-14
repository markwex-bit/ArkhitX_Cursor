import type { IntakeSummary, MetadataCoverageReport } from '../types'
import MetadataCoverageTable from './MetadataCoverageTable'

export default function IntakePanel({
  intake,
  coverage,
}: {
  intake: IntakeSummary
  coverage: MetadataCoverageReport[]
}) {
  return (
    <div className="space-y-3">
      <div className="ax-panel overflow-hidden">
        <div className="ax-panel-toolbar">
          <span className="ax-panel-toolbar-title">Phase 1 — Data intake</span>
          <div className="ax-panel-toolbar-meta">
            <span>
              Source:{' '}
              <strong className="text-ax-text">{intake.data_source === 'live' ? 'Live APIs' : 'Sample files'}</strong>
            </span>
            <span>
              <strong className="text-ax-text">{intake.qlik_count}</strong> Qlik apps
            </span>
            <span>
              <strong className="text-ax-text">{intake.pbi_count}</strong> Power BI datasets
            </span>
          </div>
        </div>
        <div className="ax-panel-body space-y-3 text-[11px]">
          <div>
            <div className="ax-label">Qlik source</div>
            <code className="ax-code break-all">{intake.qlik_source_label}</code>
          </div>
          <div>
            <div className="ax-label">Power BI source</div>
            <code className="ax-code break-all">{intake.pbi_source_label}</code>
          </div>
          <div>
            <div className="ax-label">How to load / refresh metadata</div>
            <ol className="list-decimal list-inside space-y-1 text-ax-text-dim mt-1">
              {intake.load_steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-[10px] text-ax-text-muted mt-2">
              Full workflow: <code className="ax-code">{intake.workflow_doc}</code> in the project{' '}
              <code className="ax-code">docs/</code> folder.
            </p>
          </div>
        </div>
      </div>

      <MetadataCoverageTable reports={coverage} />
    </div>
  )
}
