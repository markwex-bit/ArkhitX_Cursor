import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { useProjectStore } from '../lib/stores/projectStore'
import { PHASE_NAMES } from '../types'
import { Plus, ChevronRight, FolderOpen } from 'lucide-react'
import { PageHeader } from '../components/ui/PageHeader'
export default function ProjectsPage() {
  const { projects, setProjects } = useProjectStore()
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [description, setDescription] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    projectsApi.list().then(({ data }) => setProjects(data))
  }, [setProjects])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data } = await projectsApi.create({ name, client_name: clientName, description })
    setProjects([data, ...projects])
    setShowCreate(false)
    setName('')
    setClientName('')
    setDescription('')
    navigate(`/projects/${data.id}`)
  }

  return (
    <div className="ax-page">
      <PageHeader
        icon={FolderOpen}
        title="Projects"
        subtitle="Manage client solution engagements"
        actions={
          <button type="button" onClick={() => setShowCreate(true)} className="ax-btn-primary">
            <Plus className="w-3.5 h-3.5" />
            New Project
          </button>
        }
      />

      <div className="ax-page-body">
        {showCreate && (
          <div className="ax-panel-pad mb-4 max-w-2xl">
            <h2 className="text-xs font-semibold mb-3">Create Project</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="ax-label">Project Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="ax-input"
                    placeholder="Supply Chain Resilience"
                  />
                </div>
                <div>
                  <label className="ax-label">Client Name</label>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    className="ax-input"
                    placeholder="Acme Manufacturing"
                  />
                </div>
              </div>
              <div>
                <label className="ax-label">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="ax-textarea"
                  placeholder="Brief description of the engagement"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="ax-btn-primary">Create</button>
                <button type="button" onClick={() => setShowCreate(false)} className="ax-btn-ghost">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-1.5 max-w-5xl">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => navigate(`/projects/${project.id}`)}
              className="ax-row-interactive group"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0 flex-1 text-left">
                  <div className="text-xs font-semibold text-ax-text truncate">{project.name}</div>
                  <div className="text-[10px] text-ax-text-muted truncate">{project.client_name}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] font-medium text-ax-primary-light">
                    Phase {project.current_phase}: {PHASE_NAMES[project.current_phase]}
                  </div>
                  <div className="text-[10px] text-ax-text-muted">{project.phase_status}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-ax-text-muted group-hover:text-ax-primary-light shrink-0" />
              </div>
            </button>
          ))}

          {projects.length === 0 && (
            <div className="ax-empty">
              <p>No projects yet</p>
              <p className="text-xs mt-1">Create your first project to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
