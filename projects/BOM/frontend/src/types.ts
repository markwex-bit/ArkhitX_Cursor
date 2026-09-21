export interface CostbookRef {
  vehicle_code: string
  milestone: string
  milestone_date: string
  display?: string
  total_tpc?: number
  region?: string
  project?: string
  platform?: string
  carline_type?: string
  brand?: string
  pcp_team?: string
  ref_person?: string
  source_file?: string
  source_url?: string
  phase?: string
  base_currency?: string
}

export interface ParetoRow {
  label: string
  tpc: number
  pct: number
  cumulative_pct: number
}

export interface CostStructureResult {
  level: string
  rows: ParetoRow[]
  total_tpc: number
  costbook: CostbookRef
}

export interface GapRow {
  label: string
  values: number[]
  gap: number
  gap_pct: number | null
  side: string
}

export interface BomAlignedRow {
  values: number[]
  gap: number
  gap_pct: number | null
  side: string
  'Part Number'?: string
  'Part Description'?: string
  [key: string]: unknown
}

export interface FullBomRow {
  part_number: string
  part_description: string
  macro_system: string
  tpc: number
  pct: number
  cumulative_pct: number
}

export interface HierarchyRow {
  path: string[]
  tpc: number
  pct: number
}

export interface HierarchyGapRow {
  fifth?: string
  l1: string
  l2: string
  l3: string
  values: number[]
  gap: number | null
  gap_pct: number | null
  side: string
}

export interface WaterfallPoint {
  label: string
  tpc: number
  delta?: number
  type: string
}

export interface WaterfallStep {
  label: string
  delta: number
  side: string
}

export interface WaterfallSegment {
  label: string
  values: number[]
}

export interface WaterfallModel {
  car_labels: string[]
  car_totals: number[]
  segments: WaterfallSegment[]
  steps: WaterfallStep[][]
  total_gap: number
  segment_level?: string
}

export interface ComparisonResult {
  kpis: {
    baseline_tpc: number
    compare_tpc: number
    gap: number
    gap_pct: number | null
    costbook_count: number
    display_currency?: string
  }
  costbooks: CostbookRef[]
  totals: number[]
  fifth_split: ParetoRow[]
  systems: ParetoRow[]
  parts: ParetoRow[]
  gap_drivers: GapRow[]
  aligned_bom: BomAlignedRow[]
  full_bom: FullBomRow[]
  waterfall: WaterfallPoint[]
  hierarchical: HierarchyRow[]
  hierarchical_by_fifth: HierarchyRow[]
  hierarchy_l123: HierarchyGapRow[]
  hierarchy_l123_by_fifth: HierarchyGapRow[]
  gap_hierarchical: GapRow[]
  analysis_bars?: ParetoRow[]
  waterfall_model: WaterfallModel | null
  level: string
  level_names: string[]
  split_values: string[]
  currency_choices: string[]
}
