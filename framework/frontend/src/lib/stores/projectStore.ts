import { create } from 'zustand'
import type { Project } from '../../types'

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
      currentProject: state.currentProject ? { ...state.currentProject, ...updates } : null,
    })),
}))
