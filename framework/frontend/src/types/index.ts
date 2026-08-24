export interface Project {
  id: string
  name: string
  client_name: string
  description: string | null
  current_phase: number
  phase_name: string
  phase_status: string
  pain_points: Record<string, string>
  signals: SignalSet
  ontology_schema: OntologySchema
  field_mappings: Record<string, unknown>
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

export const PHASE_NAMES: Record<number, string> = {
  0: 'Project Kickoff',
  1: 'Ontology Design',
  2: 'Data Mapping',
  3: 'Graph Population',
  4: 'Agent Build',
  5: 'Solution Validation',
  6: 'Delivery Package',
}

export const GATE_NAMES: Record<number, string> = {
  0: 'signal_gate',
  1: 'schema_gate',
  2: 'mapping_gate',
  3: 'data_gate',
  4: 'agent_gate',
  5: 'validation_gate',
}
