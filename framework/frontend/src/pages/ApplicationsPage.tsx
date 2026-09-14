import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applicationsApi } from '../lib/api'
import { Boxes, ChevronRight, Hammer, FileCheck2, Network, ShieldCheck } from 'lucide-react'
import { cn } from '../lib/utils'
import { PageHeader } from '../components/ui/PageHeader'

interface Application {
  slug: string
  name: string
  description: string
  ports: { frontend: number; backend: number; db: number }
  on_disk: boolean
  current_phase: 0 | 1 | 2 | 3
  project_id: string | null
  phases: {
    build: { ready: boolean }
    register: { complete: boolean }
    seed: { complete: boolean; events: number }
    govern: { audit_logs: number; grounding_records: number }
  }
}

const PHASE_LABELS = ['Build', 'Register', 'Seed', 'Govern'] as const
const PHASE_ICONS = [Hammer, FileCheck2, Network, ShieldCheck]

function PhaseStepper({ currentPhase }: { currentPhase: number }) {
  return (
    <div className="flex items-center gap-1">
      {PHASE_LABELS.map((label, idx) => {
        const Icon = PHASE_ICONS[idx]
        const isComplete = idx < currentPhase
        const isCurrent = idx === currentPhase
        return (
          <div key={label} className="flex items-center gap-1">
            <div
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap',
                isComplete && 'ax-phase-done',
                isCurrent && !isComplete && 'ax-phase-current',
                !isComplete && !isCurrent && 'ax-phase-pending',
              )}
            >
              <Icon className="w-2.5 h-2.5" />
              {label}
            </div>
            {idx < 3 && (
              <div className={cn('w-3 h-px', isComplete ? 'bg-emerald-500/40' : 'bg-ax-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    applicationsApi
      .list()
      .then(({ data }) => setApps(data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="ax-page">
      <PageHeader
        icon={Boxes}
        title="Applications"
        subtitle="AI applications in your workspace and their governance phase"
        actions={!loading ? <span className="text-[10px] text-ax-text-muted">{apps.length} apps</span> : undefined}
      />

      <div className="ax-page-body">
        {loading && <div className="text-xs text-ax-text-muted py-8 text-center">Loading…</div>}

        {!loading && apps.length === 0 && (
          <div className="ax-empty">
            <p>No applications yet</p>
            <p className="text-xs mt-1">
              Run <code className="ax-code">python scripts/new_project.py &lt;slug&gt;</code> to scaffold one.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5 max-w-5xl">
          {apps.map((app) => (
            <button
              key={app.slug}
              type="button"
              onClick={() => navigate(`/applications/${app.slug}`)}
              className="ax-row-interactive group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="text-xs font-semibold text-ax-text truncate">{app.name}</span>
                    <span className="text-[10px] font-mono text-ax-text-muted shrink-0">/{app.slug}</span>
                  </div>
                  <p className="text-[10px] text-ax-text-muted truncate mt-0.5">{app.description}</p>
                </div>

                <div className="hidden sm:block shrink-0 text-[10px] font-mono text-ax-text-muted">
                  :{app.ports.frontend}
                  <span className="text-ax-border mx-1">/</span>
                  api:{app.ports.backend}
                </div>

                <div className="hidden md:block shrink-0">
                  <PhaseStepper currentPhase={app.current_phase} />
                </div>

                {app.current_phase === 3 && (
                  <div className="hidden lg:flex shrink-0 gap-2 text-[10px] text-ax-text-muted">
                    <span>{app.phases.govern.audit_logs} audit</span>
                    <span>{app.phases.govern.grounding_records} grounding</span>
                  </div>
                )}

                {!app.on_disk && <span className="shrink-0 text-[10px] text-ax-amber">off disk</span>}

                <ChevronRight className="w-3.5 h-3.5 text-ax-text-muted group-hover:text-ax-primary-light shrink-0" />
              </div>

              <div className="md:hidden mt-2">
                <PhaseStepper currentPhase={app.current_phase} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
