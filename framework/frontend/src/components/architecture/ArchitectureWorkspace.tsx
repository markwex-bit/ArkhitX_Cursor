import { useEffect, useState, useCallback } from 'react'
import { architectureApi } from '../../lib/api'
import type { ArchitectureDocument, ArchitectureDecision, ArchitectureCatalogEntry } from '../../types'
import TierSelector from './TierSelector'
import DocumentList from './DocumentList'
import DocumentEditor from './DocumentEditor'
import DecisionLog from './DecisionLog'
import { FileText, GitBranch } from 'lucide-react'

interface Props {
  projectId: string
  tier: 'lightweight' | 'full' | null
  onReadinessChange?: (ready: boolean, outstandingCount: number) => void
}

type Tab = 'documents' | 'decisions'

export default function ArchitectureWorkspace({ projectId, tier, onReadinessChange }: Props) {
  const [catalog, setCatalog] = useState<ArchitectureCatalogEntry[]>([])
  const [lightweightCount, setLightweightCount] = useState(0)
  const [fullCount, setFullCount] = useState(0)
  const [documents, setDocuments] = useState<ArchitectureDocument[]>([])
  const [decisions, setDecisions] = useState<ArchitectureDecision[]>([])
  const [tab, setTab] = useState<Tab>('documents')
  const [editingDoc, setEditingDoc] = useState<ArchitectureDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasTier, setHasTier] = useState(!!tier)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [catalogRes, docsRes, decisionsRes] = await Promise.all([
        architectureApi.getCatalog(projectId),
        architectureApi.listDocuments(projectId),
        architectureApi.listDecisions(projectId),
      ])
      setCatalog(catalogRes.data.catalog)
      setLightweightCount(catalogRes.data.lightweight_count)
      setFullCount(catalogRes.data.full_count)
      setDocuments(docsRes.data)
      setDecisions(decisionsRes.data)
      setHasTier(!!catalogRes.data.current_tier)

      const approved = docsRes.data.filter((d: ArchitectureDocument) => d.status === 'approved').length
      const outstanding = docsRes.data.length - approved
      onReadinessChange?.(docsRes.data.length > 0 && outstanding === 0, outstanding)
    } finally {
      setLoading(false)
    }
  }, [projectId, onReadinessChange])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Loading architecture workspace...</div>
  }

  if (!hasTier) {
    return (
      <TierSelector
        projectId={projectId}
        lightweightCount={lightweightCount}
        fullCount={fullCount}
        onChosen={loadAll}
      />
    )
  }

  const catalogByKey = Object.fromEntries(catalog.map((c) => [c.key, c]))
  const approvedCount = documents.filter((d) => d.status === 'approved').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <p className="text-sm text-blue-800">
          <span className="font-semibold">{approvedCount}/{documents.length}</span> documents approved
          {' · '}
          <span className="font-semibold">{decisions.length}</span> ADR{decisions.length === 1 ? '' : 's'} logged
        </p>
        <span className="text-xs text-blue-600 uppercase font-medium">{tier} package</span>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab('documents')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'documents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" /> Documents
        </button>
        <button
          onClick={() => setTab('decisions')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'decisions' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <GitBranch className="w-4 h-4" /> Decisions (ADRs)
        </button>
      </div>

      {tab === 'documents' && <DocumentList documents={documents} onOpen={setEditingDoc} />}
      {tab === 'decisions' && (
        <DecisionLog projectId={projectId} decisions={decisions} onChange={setDecisions} />
      )}

      {editingDoc && (
        <DocumentEditor
          projectId={projectId}
          document={editingDoc}
          guidance={catalogByKey[editingDoc.doc_key]?.guidance || ''}
          onClose={() => {
            setEditingDoc(null)
            loadAll()
          }}
          onSaved={(updated) => {
            setDocuments((docs) => docs.map((d) => (d.doc_key === updated.doc_key ? updated : d)))
            setEditingDoc(updated)
          }}
        />
      )}
    </div>
  )
}
