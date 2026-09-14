import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
}

export const projectsApi = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: { name: string; client_name: string; description?: string }) =>
    api.post('/projects', data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  decideGate: (projectId: string, gateName: string, decision: {
    approved: boolean; reviewer?: string; notes?: string; modifications?: Record<string, unknown>
    conditions?: string[]
  }) => api.post(`/projects/${projectId}/gates/${gateName}/decide`, decision),
}

export const architectureApi = {
  getCatalog: (projectId: string) =>
    api.get(`/projects/${projectId}/architecture/catalog`),
  setTier: (projectId: string, tier: 'lightweight' | 'full', reviewMode: 'self' | 'stakeholder') =>
    api.post(`/projects/${projectId}/architecture/tier`, { tier, review_mode: reviewMode }),
  listDocuments: (projectId: string) =>
    api.get(`/projects/${projectId}/architecture/documents`),
  getDocument: (projectId: string, docKey: string) =>
    api.get(`/projects/${projectId}/architecture/documents/${docKey}`),
  updateDocument: (projectId: string, docKey: string, data: { content?: string; status?: string }) =>
    api.patch(`/projects/${projectId}/architecture/documents/${docKey}`, data),
  draftDocument: (projectId: string, docKey: string, regenerate = false) =>
    api.post(`/projects/${projectId}/architecture/documents/${docKey}/draft`, { regenerate }),
  listDecisions: (projectId: string) =>
    api.get(`/projects/${projectId}/architecture/decisions`),
  createDecision: (projectId: string, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/architecture/decisions`, data),
  updateDecision: (projectId: string, decisionId: string, data: Record<string, unknown>) =>
    api.patch(`/projects/${projectId}/architecture/decisions/${decisionId}`, data),
  deleteDecision: (projectId: string, decisionId: string) =>
    api.delete(`/projects/${projectId}/architecture/decisions/${decisionId}`),
  readiness: (projectId: string) =>
    api.get(`/projects/${projectId}/architecture/readiness`),
}

export const governanceApi = {
  auditLogs: (params?: { project_id?: string; action?: string; limit?: number }) =>
    api.get('/governance/audit-logs', { params }),
  groundingRecords: (params?: { project_id?: string; agent_name?: string; limit?: number }) =>
    api.get('/governance/grounding', { params }),
  groundingSummary: (projectId: string) =>
    api.get(`/governance/grounding/summary/${projectId}`),
  pipelineEvents: (params?: { project_id?: string }) =>
    api.get('/governance/pipeline-events', { params }),
  listPrompts: () => api.get('/governance/prompts'),
  getPrompt: (id: string) => api.get(`/governance/prompts/${id}`),
  updatePrompt: (id: string, data: Record<string, unknown>) =>
    api.put(`/governance/prompts/${id}`, data),
}

export const applicationsApi = {
  list:               ()              => api.get('/applications/'),
  get:                (slug: string)  => api.get(`/applications/${slug}`),
  register:           (slug: string)  => api.post(`/applications/${slug}/register`),
  seedGraph:          (slug: string)  => api.post(`/applications/${slug}/seed-graph`),
  governance:         (slug: string)  => api.get(`/applications/${slug}/governance`),
  verificationStatus: (slug: string)  => api.get(`/applications/${slug}/verification-status`),
  verifyRule: (slug: string, ruleId: string, verifier: string, notes: string) =>
    api.post(`/applications/${slug}/verify-rule`, { rule_id: ruleId, verifier, notes }),
}

export const arkhitxAgentsApi = {
  extractOntology: (slug: string) =>
    api.post('/agents/extract-ontology', { slug }),
  detectCompliance: (slug: string) =>
    api.post('/agents/detect-compliance', { slug }),
  generateGroundingQuery: (slug: string, agentName: string, agentPurpose: string, entityTypes?: string[]) =>
    api.post('/agents/generate-grounding-query', { slug, agent_name: agentName, agent_purpose: agentPurpose, entity_types: entityTypes }),
  buildGroundingQuery: (taskDescription: string) =>
    api.post('/agents/build-grounding-query', { task_description: taskDescription }),
  checkCompliance: (proposedOutput: string, taskContext?: string) =>
    api.post('/agents/check-compliance', { proposed_output: proposedOutput, task_context: taskContext }),
  validatePhaseGate: (slug: string, targetPhase: number) =>
    api.post('/agents/validate-phase-gate', { slug, target_phase: targetPhase }),
}

export const uploadApi = {
  upload: (projectId: string, file: File, purpose: string) => {
    const formData = new FormData()
    formData.append('project_id', projectId)
    formData.append('purpose', purpose)
    formData.append('file', file)
    return api.post('/upload', formData)
  },
}

export default api
