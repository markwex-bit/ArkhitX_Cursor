import axios from 'axios'
import type {
  BacklogEntry,
  EligibilitySummary,
  IntakeSummary,
  MetadataCoverageReport,
  ParityRow,
  QlikDispositionResult,
  QlikQualificationSummary,
  SignOffRecord,
  SignOffRequest,
} from '../types'

const api = axios.create({
  baseURL: '/api',
})

export const getMeta = () =>
  api
    .get<{ data_source: 'sample' | 'live'; llm_analysis_ready: boolean }>('/meta')
    .then((r) => r.data)

export const getIntake = () => api.get<IntakeSummary>('/intake').then((r) => r.data)

export const getMetadataCoverage = () =>
  api.get<MetadataCoverageReport[]>('/metadata-coverage').then((r) => r.data)

export const getEligibility = () =>
  api.get<EligibilitySummary>('/eligibility').then((r) => r.data)

export const getQlikQualification = () =>
  api.get<QlikQualificationSummary>('/qualification/qlik').then((r) => r.data)

export const getParityMatrix = () =>
  api.get<ParityRow[]>('/quality/parity').then((r) => r.data)

export const getDispositions = () =>
  api.get<QlikDispositionResult[]>('/dispositions').then((r) => r.data)

export const refreshDispositions = () =>
  api.post<QlikDispositionResult[]>('/dispositions/refresh').then((r) => r.data)

export const postSignOff = (request: SignOffRequest) =>
  api.post<SignOffRecord>('/signoff', request).then((r) => r.data)

export const getSignOffs = () =>
  api.get<SignOffRecord[]>('/signoffs').then((r) => r.data)

export const getBacklog = () =>
  api.get<BacklogEntry[]>('/backlog').then((r) => r.data)

export const backlogCsvUrl = '/api/backlog/export.csv'

export default api
