import { create } from 'zustand'

interface Project {
  id: string
  name: string
  client_name: string
  description: string | null
  current_phase: number
  phase_name: string
  phase_status: string
  pain_points: Record<string, unknown>
  signals: Record<string, unknown>
  ontology_schema: Record<string, unknown>
  field_mappings: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

interface ProjectState {
  projects: Project[]
  currentProject: Project | null
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  updateCurrentProject: (updates: Partial<Project>) => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  updateCurrentProject: (updates) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, ...updates }
        : null,
    })),
}))
