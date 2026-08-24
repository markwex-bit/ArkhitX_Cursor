import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applicationsApi } from '../lib/api'
import { Boxes, ChevronRight, Hammer, FileCheck2, Network, ShieldCheck } from 'lucide-react'

interface Application {
  slug: string
  name: string
  description: string
  ports: { frontend: number; backend: number; db: number }
  on_disk: boolean
  current_phase: 0 | 1 | 2 | 3
  project_id: string | null
  phases: {
    build:    { ready: boolean }
    register: { complete: boolean }
    seed:     { complete: boolean; events: number }
    govern:   { audit_logs: number; grounding_records: number }
  }
}

const PHASE_LABELS = ['Build', 'Register', 'Seed', 'Govern'] as const
const PHASE_ICONS  = [Hammer, FileCheck2, Network, ShieldCheck]

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    applicationsApi.list()
      .then(({ data }) => setApps(data))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Boxes className="w-6 h-6 text-blue-600" />
            Applications
          </h1>
          <p className="text-gray-500 mt-1">
            AI applications in your workspace and their governance phase
          </p>
        </div>
      </div>

      {loading && <div className="text-gray-400">Loading…</div>}

      <div className="grid gap-3">
        {apps.map((app) => (
          <div
            key={app.slug}
            onClick={() => navigate(`/applications/${app.slug}`)}
            className="p-5 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900 text-lg">{app.name}</h3>
                  <span className="text-xs font-mono text-gray-400">/{app.slug}</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">{app.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>:{app.ports.frontend} / api :{app.ports.backend}</span>
                  {!app.on_disk && (
                    <span className="text-amber-600">Not on disk</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 ml-4" />
            </div>

            {/* Phase progress */}
            <div className="mt-4 flex items-center gap-2">
              {PHASE_LABELS.map((label, idx) => {
                const Icon = PHASE_ICONS[idx]
                const isComplete = idx < app.current_phase
                const isCurrent  = idx === app.current_phase
                return (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                      isComplete ? 'bg-green-100 text-green-700' :
                      isCurrent  ? 'bg-blue-100  text-blue-700'  :
                                   'bg-gray-100  text-gray-400'
                    }`}>
                      <Icon className="w-3 h-3" />
                      {label}
                    </div>
                    {idx < 3 && (
                      <div className={`h-px flex-1 ${
                        isComplete ? 'bg-green-300' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                )
              })}
            </div>

            {app.current_phase === 3 && (
              <div className="mt-3 flex gap-4 text-xs text-gray-500">
                <span>{app.phases.govern.audit_logs} audit logs</span>
                <span>{app.phases.govern.grounding_records} grounding records</span>
              </div>
            )}
          </div>
        ))}

        {!loading && apps.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No applications yet</p>
            <p className="text-sm mt-1">
              Run <code className="bg-gray-100 px-2 py-0.5 rounded">python scripts/new_project.py &lt;slug&gt;</code>
              {' '}to scaffold one.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
