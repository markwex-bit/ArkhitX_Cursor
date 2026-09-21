import axios from 'axios'
import type { ComparisonResult, CostbookRef, CostStructureResult } from './types'

const api = axios.create({ baseURL: '/api' })

export function currencyQueryParams(displayCurrency: string): Record<string, string> {
  if (!displayCurrency || displayCurrency === '(Source currency)') return {}
  return { display_currency: displayCurrency }
}

export async function getMeta() {
  const { data } = await api.get<{ level_names: string[]; split_values: string[]; currency_choices: string[] }>('/meta')
  return data
}

export async function getCatalog(params: Record<string, string> = {}, displayCurrency = '') {
  const { data } = await api.get<CostbookRef[]>('/catalog', {
    params: { ...params, ...currencyQueryParams(displayCurrency) },
  })
  return data
}

export type CatalogFilterField =
  | 'region'
  | 'carline_type'
  | 'platform'
  | 'powertrain'
  | 'milestone'
  | 'project'
  | 'brand'
  | 'control_owner'

export async function getFilterOptions(field: CatalogFilterField, params: Record<string, string> = {}) {
  const { data } = await api.get<string[]>(`/filters/${field}`, { params })
  return data
}

export async function searchCostbooks(q: string) {
  const { data } = await api.get<CostbookRef[]>('/costbooks/search', { params: { q, limit: 15 } })
  return data
}

export async function getTimeline(vehicleCode: string) {
  const { data } = await api.get<CostbookRef[]>('/carlines/timeline', { params: { vehicle_code: vehicleCode } })
  return data
}

export async function getCostStructure(
  costbook: CostbookRef,
  level = 'L1 Macro System',
  displayCurrency = '',
  fifthFilter = '(All)',
) {
  const { data } = await api.post<CostStructureResult>('/analysis/structure', {
    costbook: {
      vehicle_code: costbook.vehicle_code,
      milestone: costbook.milestone,
      milestone_date: costbook.milestone_date,
    },
    level,
    display_currency: displayCurrency,
    fifth_filter: fifthFilter,
  })
  return data
}

export async function calculateComparison(
  costbooks: CostbookRef[],
  level = 'Macro System',
  displayCurrency = '',
  fifthFilter = '(All)',
) {
  const { data } = await api.post<ComparisonResult>('/comparisons/calculate', {
    costbooks: costbooks.map(({ vehicle_code, milestone, milestone_date }) => ({
      vehicle_code,
      milestone,
      milestone_date,
    })),
    level,
    display_currency: displayCurrency,
    fifth_filter: fifthFilter,
  })
  return data
}

export async function explainComparison(comparison: ComparisonResult, question: string) {
  const { data } = await api.post<{ answer: string; provider: string }>('/explain', { comparison, question })
  return data
}

export async function downloadCostbookReport(costbooks: CostbookRef[], displayCurrency = '') {
  const res = await api.post('/reports/costbook', {
    costbooks: costbooks.slice(0, 1).map(({ vehicle_code, milestone, milestone_date }) => ({
      vehicle_code,
      milestone,
      milestone_date,
    })),
    display_currency: displayCurrency,
  }, { responseType: 'blob' })
  return res.data as Blob
}

export async function downloadGapReport(costbooks: CostbookRef[], level: string, displayCurrency = '', fifthFilter = '(All)') {
  const res = await api.post('/reports/gap', {
    costbooks: costbooks.map(({ vehicle_code, milestone, milestone_date }) => ({
      vehicle_code,
      milestone,
      milestone_date,
    })),
    level,
    display_currency: displayCurrency,
    fifth_filter: fifthFilter,
  }, { responseType: 'blob' })
  return res.data as Blob
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
