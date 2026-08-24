import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../lib/api'
import { useProjectStore } from '../lib/stores/projectStore'
import { PHASE_NAMES } from '../types'
import { Plus, ChevronRight } from 'lucide-react'

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
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 mt-1">Manage client solution engagements</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {showCreate && (
        <div className="mb-8 p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Create Project</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Supply Chain Resilience"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Acme Manufacturing"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the engagement"
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                Create
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {projects.map((project) => (
          <div
            key={project.id}
            onClick={() => navigate(`/projects/${project.id}`)}
            className="p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all flex items-center justify-between"
          >
            <div>
              <h3 className="font-semibold text-gray-900">{project.name}</h3>
              <p className="text-sm text-gray-500">{project.client_name}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-blue-600">
                  Phase {project.current_phase}: {PHASE_NAMES[project.current_phase]}
                </div>
                <div className="text-xs text-gray-400">{project.phase_status}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">No projects yet</p>
            <p className="text-sm mt-1">Create your first project to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}
