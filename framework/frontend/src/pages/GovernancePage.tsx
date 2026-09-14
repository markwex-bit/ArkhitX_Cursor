import { useEffect, useState } from 'react'
import { LayoutDashboard, ShieldCheck, GitBranch, ScrollText, Activity } from 'lucide-react'
import { TabBar } from '../components/ui/TabBar'
import { PageHeader } from '../components/ui/PageHeader'
import { ProjectSelector } from '../components/ui/ProjectSelector'
import { useGovernanceStore } from '../lib/stores/governanceStore'
import { GovernanceOverviewTab } from '../components/governance/GovernanceOverviewTab'
import { GovernanceApprovalsTab } from '../components/governance/GovernanceApprovalsTab'
import { GovernanceLineageTab } from '../components/governance/GovernanceLineageTab'
import { GovernanceAuditLogTab } from '../components/governance/GovernanceAuditLogTab'
import { countPendingGates } from '../lib/governanceUtils'

type GovTab = 'overview' | 'approvals' | 'lineage' | 'audit'

const TABS = [
  { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard },
  { key: 'approvals' as const, label: 'Approvals', icon: ShieldCheck },
  { key: 'lineage' as const, label: 'Lineage', icon: GitBranch },
  { key: 'audit' as const, label: 'Audit Log', icon: ScrollText },
]

export default function GovernancePage() {
  const [tab, setTab] = useState<GovTab>('overview')
  const {
    projects,
    selectedProject,
    selectedProjectId,
    auditLog,
    gateHistory,
    lineage,
    llmSummary,
    pipelineEvents,
    pipelineOverview,
    loading,
    loadProjects,
    selectProject,
    refreshProject,
  } = useGovernanceStore()

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  const project = selectedProject ?? projects.find((p) => p.id === selectedProjectId) ?? null
  const pendingGateCount = countPendingGates(project, gateHistory)

  return (
    <div className="ax-page">
      <PageHeader
        icon={Activity}
        title="Governance"
        subtitle="Trust, approvals, lineage, and audit for playbook projects"
        actions={
          <>
            <ProjectSelector
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              selectedId={selectedProjectId}
              onSelect={selectProject}
            />
            <button
              type="button"
              onClick={() => void refreshProject()}
              disabled={loading || !selectedProjectId}
              className="ax-btn-secondary"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </>
        }
      >
        <TabBar tabs={TABS} active={tab} onChange={setTab} className="mt-2" />
      </PageHeader>

      <div className="ax-page-body flex flex-col min-h-0">
        {!project ? (
          <div className="flex-1 flex items-center justify-center text-sm text-ax-text-muted">
            No projects registered yet. Register a project to view governance data.
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <GovernanceOverviewTab
                pipelineOverview={pipelineOverview}
                pendingGateCount={pendingGateCount}
                loading={loading}
              />
            )}
            {tab === 'approvals' && (
              <GovernanceApprovalsTab project={project} decisions={gateHistory} />
            )}
            {tab === 'lineage' && (
              <GovernanceLineageTab lineage={lineage as Parameters<typeof GovernanceLineageTab>[0]['lineage']} />
            )}
            {tab === 'audit' && <GovernanceAuditLogTab entries={auditLog} />}
          </>
        )}
      </div>
    </div>
  )
}
