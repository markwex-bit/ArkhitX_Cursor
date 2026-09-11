import axios from 'axios'
import type {
  BacklogEntry,
  EligibilitySummary,
  ParityRow,
  QlikDispositionResult,
  QlikQualityResult,
  SignOffRecord,
  SignOffRequest,
} from '../types'

const api = axios.create({
  baseURL: '/api',
})

export const getMeta = () =>
  api.get<{ data_source: 'sample' | 'live' }>('/meta').then((r) => r.data)

export const getEligibility = () =>
  api.get<EligibilitySummary>('/eligibility').then((r) => r.data)

export const getQlikQuality = () =>
  api.get<QlikQualityResult[]>('/quality/qlik').then((r) => r.data)

export const getParityMatrix = () =>
  api.get<ParityRow[]>('/quality/parity').then((r) => r.data)

export const getDispositions = () =>
  api.get<QlikDispositionResult[]>('/dispositions').then((r) => r.data)

export const refreshDispositions = () =>
  api.post<{ status: string; qlik_apps: number }>('/dispositions/refresh').then((r) => r.data)

export const postSignOff = (request: SignOffRequest) =>
  api.post<SignOffRecord>('/signoff', request).then((r) => r.data)

export const getSignOffs = () =>
  api.get<SignOffRecord[]>('/signoffs').then((r) => r.data)

export const getBacklog = () =>
  api.get<BacklogEntry[]>('/backlog').then((r) => r.data)

export const backlogCsvUrl = '/api/backlog/export.csv'

export default api
