import { GATE_NAMES, Project } from '../types'
import type { GateDecisionRecord } from '../types'

export function agentRetrievalMode(project: Project | null, agentName: string): string {
  if (!project?.retrieval_strategy) return 'hybrid'
  const agents = project.retrieval_strategy.agents || {}
  return agents[agentName] || project.retrieval_strategy.default || 'hybrid'
}

export function isGraphGroundingAgent(project: Project | null, agentName: string): boolean {
  const mode = agentRetrievalMode(project, agentName)
  return mode === 'graph' || mode === 'hybrid'
}

export function countPendingGates(project: Project | null, gateHistory: GateDecisionRecord[]): number {
  if (!project) return 0
  const approvedGates = new Set(
    gateHistory.filter((g) => g.decision === 'approved').map((g) => g.gate_name),
  )
  return Object.entries(GATE_NAMES)
    .filter(([phaseStr]) => Number(phaseStr) === project.current_phase)
    .map(([, gateName]) => gateName)
    .filter((gateName) => !approvedGates.has(gateName)).length
}

export function tokensFromAuditContext(context: Record<string, unknown>): {
  input: number | null
  output: number | null
} {
  const input = typeof context.input_tokens === 'number' ? context.input_tokens : null
  const output = typeof context.output_tokens === 'number' ? context.output_tokens : null
  return { input, output }
}
