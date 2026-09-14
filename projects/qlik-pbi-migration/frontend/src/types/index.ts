export type ConfidenceTier = 'High' | 'Medium' | 'Low'

export type Disposition =
  | 'Reuse'
  | 'Extend'
  | 'Rebuild'
  | 'Sunset - No Replacement Needed'

export type SignOffDecision = 'confirmed' | 'overridden' | 'needs_more_info'

export interface HealthResponse {
  status: string
  project: string
}

export interface EligibilityResult {
  dataset_id: string
  name: string
  workspace_name: string
  eligible: boolean
  exclusion_reasons: string[]
  quality_flags: string[]
}

export interface EligibilitySummary {
  total: number
  eligible_count: number
  excluded_count: number
  eligible_pct: number
  excluded_pct: number
  by_reason: Record<string, number>
  results: EligibilityResult[]
}

export interface IntakeSummary {
  data_source: 'sample' | 'live'
  qlik_count: number
  pbi_count: number
  qlik_source_label: string
  pbi_source_label: string
  load_steps: string[]
  workflow_doc: string
}

export interface MetadataFieldStat {
  field_key: string
  label: string
  tier: string
  present_count: number
  total: number
  pct: number
}

export interface MetadataCoverageReport {
  platform: string
  total_apps: number
  fields: MetadataFieldStat[]
}

export interface QlikQualificationResult {
  app_id: string
  name: string
  qualified: boolean
  completeness_score: number
  exclusion_reasons: string[]
  quality_flags: string[]
}

export interface QlikQualificationSummary {
  total: number
  qualified_count: number
  excluded_count: number
  qualified_pct: number
  excluded_pct: number
  by_reason: Record<string, number>
  completeness_threshold: number
  results: QlikQualificationResult[]
}

export interface QlikQualityResult {
  app_id: string
  name: string
  completeness_score: number
  flags: string[]
}

export interface ParityRow {
  capability: string
  qlik: string
  power_bi: string
  note: string
}

export interface MatchCandidate {
  qlik_app_id: string
  pbi_dataset_id: string
  pbi_name: string
  pbi_workspace_name: string
  lineage_match: boolean
  lineage_signal: string
  name_similarity: number
  measure_overlap: number
  confidence_tier: ConfidenceTier
  signals_available: string[]
  signals_missing: string[]
  semantic_score: number | null
  semantic_rationale: string | null
  matched_concepts: string[]
  unmatched_concepts: string[]
  disposition: Disposition | null
  effort: string | null
  advisor_rationale: string | null
  llm_used: boolean
}

export interface QlikDispositionResult {
  qlik_app_id: string
  qlik_app_name: string
  candidates: MatchCandidate[]
  disposition: Disposition | null
}

export interface SignOffRequest {
  qlik_app_id: string
  pbi_dataset_id?: string | null
  decision: SignOffDecision
  reviewer: string
  notes?: string
}

export interface SignOffRecord extends SignOffRequest {
  timestamp: string
}

export interface BacklogEntry {
  qlik_app_id: string
  qlik_app_name: string
  pbi_dataset_id: string | null
  pbi_name: string | null
  disposition: Disposition | null
  confidence_tier: ConfidenceTier | null
  effort: string | null
  decision: SignOffDecision
  reviewer: string
  notes: string
  timestamp: string
}
