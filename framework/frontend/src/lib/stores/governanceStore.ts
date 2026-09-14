import { create } from 'zustand'
import { governanceApi, projectsApi } from '../api'
import type { AuditLogEntry, GateDecisionRecord, PipelineOverview, Project } from '../../types'

interface LlmUsageSummary {
  calls: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

interface PipelineEvent {
  id: string
  project_id: string | null
  phase: number | null
  step_name: string
  status: string
  created_at: string | null
}

interface GovernanceState {
  projects: Project[]
  selectedProject: Project | null
  selectedProjectId: string | null
  auditLog: AuditLogEntry[]
  gateHistory: GateDecisionRecord[]
  lineage: Record<string, unknown> | null
  llmSummary: LlmUsageSummary | null
  pipelineEvents: PipelineEvent[]
  pipelineOverview: PipelineOverview | null
  loading: boolean

  loadProjects: () => Promise<void>
  selectProject: (id: string) => void
  refreshProject: () => Promise<void>
}

export const useGovernanceStore = create<GovernanceState>((set, get) => ({
  projects: [],
  selectedProject: null,
  selectedProjectId: null,
  auditLog: [],
  gateHistory: [],
  lineage: null,
  llmSummary: null,
  pipelineEvents: [],
  pipelineOverview: null,
  loading: false,

  loadProjects: async () => {
    const { data } = await projectsApi.list()
    const projects = data as Project[]
    set({ projects })
    if (!get().selectedProjectId && projects.length > 0) {
      set({ selectedProjectId: projects[0].id })
      await get().refreshProject()
    }
  },

  selectProject: (id: string) => {
    set({ selectedProjectId: id })
    void get().refreshProject()
  },

  refreshProject: async () => {
    const pid = get().selectedProjectId
    if (!pid) return
    set({ loading: true })
    try {
      const selectedProject = get().projects.find((p) => p.id === pid) ?? null
      const [auditRes, gatesRes, lineageRes, llmRes, pipeRes, overviewRes, projectRes] =
        await Promise.all([
          governanceApi.auditLogs({ project_id: pid, limit: 200 }),
          governanceApi.gateHistory(pid),
          governanceApi.lineage(pid),
          governanceApi.llmUsage(pid),
          governanceApi.pipelineEvents({ project_id: pid, limit: 100 }),
          governanceApi.pipelineOverview(pid),
          projectsApi.get(pid),
        ])
      set({
        selectedProject: (projectRes.data as Project) ?? selectedProject,
        auditLog: auditRes.data as AuditLogEntry[],
        gateHistory: gatesRes.data as GateDecisionRecord[],
        lineage: lineageRes.data as Record<string, unknown>,
        llmSummary: (llmRes.data as { summary: LlmUsageSummary }).summary,
        pipelineEvents: pipeRes.data as PipelineEvent[],
        pipelineOverview: overviewRes.data as PipelineOverview,
      })
    } finally {
      set({ loading: false })
    }
  },
}))
