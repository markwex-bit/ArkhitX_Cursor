export interface Project {
  id: string
  name: string
  client_name: string
  description: string | null
  current_phase: number
  phase_name: string
  phase_status: string
  architecture_tier: 'lightweight' | 'full' | null
  architecture_review_mode: 'self' | 'stakeholder' | null
  pain_points: Record<string, string>
  signals: SignalSet
  ontology_schema: OntologySchema
  field_mappings: Record<string, unknown>
  retrieval_strategy?: {
    default?: string
    agents?: Record<string, string>
  }
  created_at: string | null
  updated_at: string | null
}

export interface Signal {
  id: string
  text: string
  source: string
  type?: 'structural' | 'contextual'
  derived?: boolean
}

export interface SignalSet {
  structural?: Signal[]
  contextual?: Signal[]
  business_questions?: Signal[]
  process_gaps?: Signal[]
}

export interface EntityDef {
  name: string
  description?: string
  properties: PropertyDef[]
  driven_by_signals?: string[]
}

export interface PropertyDef {
  name: string
  type: string
  required?: boolean
  range?: [number, number]
  values?: string[]
}

export interface RelationshipDef {
  name: string
  from_entity: string
  to_entity: string
  cardinality: string
  properties?: PropertyDef[]
  driven_by_signals?: string[]
}

export interface QueryPath {
  bq_id: string
  bq_text: string
  path: string
  filter?: string
  required_entities: string[]
  required_relationships: string[]
}

export interface OntologySchema {
  entities?: EntityDef[]
  relationships?: RelationshipDef[]
  query_paths?: QueryPath[]
}

export interface AuditLogEntry {
  id: string
  project_id: string | null
  actor: string
  action: string
  entity_type: string | null
  entity_id: string | null
  context: Record<string, unknown>
  result: Record<string, unknown>
  created_at: string | null
}

export interface GateDecisionRecord {
  id: string
  project_id: string
  gate_name: string
  phase: number | null
  decision: string
  reviewer: string | null
  notes: string | null
  conditions: string[]
  items_reviewed: Record<string, unknown>
  created_at: string | null
}

export interface GroundingRecord {
  id: string
  project_id: string | null
  agent_name: string
  grounding_score: number | null
  node_count: number
  query_path: string | null
  cited_nodes: unknown[]
  created_at: string | null
}

export interface PipelineHistoryRun {
  id: string
  status: string
  tokens_total: number | null
  output_summary: string
  confidence: number | null
  duration_ms: number | null
  created_at: string | null
}

export interface PipelineTimelineRow {
  id: string
  source: 'pipeline' | 'audit'
  stage: string
  process_group?: string
  agent: string
  agent_name: string
  step_index: number
  step_name: string
  step_type: string
  status: string
  tokens_in: number | null
  tokens_out: number | null
  tokens_total: number | null
  output_summary: string
  grounding_score: number | null
  confidence: number | null
  duration_ms: number | null
  error_message: string | null
  phase: number | null
  created_at: string | null
  history?: PipelineHistoryRun[]
  run_count?: number
}

export interface PipelineStageGroup {
  stage: string
  rows: PipelineTimelineRow[]
  done: number
  total: number
  running: number
  failed: number
  tokens: number
}

export interface PipelineOverview {
  summary: {
    total_steps: number
    completed: number
    running: number
    failed: number
    pending: number
    total_tokens: number
    stage_count: number
    gates_passed?: number
  }
  stages: PipelineStageGroup[]
  rows: PipelineTimelineRow[]
}

export interface AgentPrompt {
  id: string
  agent_name: string
  description: string | null
  model: string
  max_tokens: number
  temperature: number
  system_prompt: string
  application_slug: string | null
  updated_at: string | null
}

// Phase -1 = Architecture & Design (Phase A) — the pre-build gate, reviewed
// and signed off before Phase 0 (Build) starts. See ArchitectureWorkspace.
// Phases -1 through 5 mirror the Playbook (see framework/docs/README.md).
// Filename prefix matches phase number (0A, 00–05). Phase 2 also has an
// advanced companion: 02-POPULATE-GRAPH-ADVANCED.md (not a separate phase).
export const PHASE_NAMES: Record<number, string> = {
  [-1]: 'Architecture & Design',
  0: 'Project Kickoff',
  1: 'Ontology Design',
  2: 'Populate Graph',
  3: 'Wire Governance',
  4: 'Validate Grounding',
  5: 'Ship',
}

export const GATE_NAMES: Record<number, string> = {
  [-1]: 'architecture_gate',
  0: 'signal_gate',
  1: 'schema_gate',
  2: 'mapping_gate',
  3: 'agent_gate',
  4: 'validation_gate',
}

// Explicit iteration order for the phase progress bar. Object key order in
// JS puts negative/non-index keys ("-1") after ascending numeric keys
// regardless of insertion order, so anything that needs -1 to render FIRST
// must iterate this array, not Object.entries(PHASE_NAMES).
export const PHASE_ORDER = [-1, 0, 1, 2, 3, 4, 5]

// Playbook instruction doc for each phase (filename prefix = phase number).
export const PHASE_DOC_FILES: Record<number, string> = {
  [-1]: '0A-ARCHITECTURE-AND-DESIGN.md',
  0: '00-BUILD-SOLUTION.md',
  1: '01-REGISTER-ONTOLOGY.md',
  2: '02-POPULATE-GRAPH.md',
  3: '03-WIRE-GOVERNANCE.md',
  4: '04-VALIDATE-GROUNDING.md',
  5: '05-SHIP.md',
}

export interface ArchitectureCatalogEntry {
  key: string
  title: string
  category: string
  tier: 'core' | 'full'
  guidance: string
}

export interface ArchitectureDocument {
  id: string
  doc_key: string
  title: string
  category: string
  tier: 'core' | 'full'
  sort_order: number
  content: string
  status: 'not_started' | 'draft' | 'in_review' | 'approved'
  updated_at: string | null
}

export interface ArchitectureDecision {
  id: string
  title: string
  context: string
  options_considered: { option: string; pros?: string; cons?: string }[]
  decision: string
  consequences: string
  status: 'proposed' | 'accepted' | 'superseded'
  created_at: string | null
  updated_at: string | null
}

export interface ArchitectureReadiness {
  tier: 'lightweight' | 'full' | null
  review_mode: 'self' | 'stakeholder' | null
  total_documents: number
  by_status: Record<string, number>
  decisions_logged: number
  ready_for_review: boolean
  outstanding: { doc_key: string; title: string; status: string }[]
}
