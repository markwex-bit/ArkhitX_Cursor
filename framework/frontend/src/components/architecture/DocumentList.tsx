import type { ArchitectureDocument } from '../../types'
import { CheckCircle2, Circle, FileEdit, Eye } from 'lucide-react'

interface Props {
  documents: ArchitectureDocument[]
  onOpen: (doc: ArchitectureDocument) => void
}

const STATUS_BADGE: Record<string, { label: string; className: string; Icon: typeof Circle }> = {
  not_started: { label: 'Not started', className: 'bg-gray-100 text-gray-500', Icon: Circle },
  draft: { label: 'Draft', className: 'bg-amber-100 text-amber-700', Icon: FileEdit },
  in_review: { label: 'In review', className: 'bg-blue-100 text-blue-700', Icon: Eye },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
}

export default function DocumentList({ documents, onOpen }: Props) {
  const byCategory = documents.reduce<Record<string, ArchitectureDocument[]>>((acc, doc) => {
    acc[doc.category] = acc[doc.category] || []
    acc[doc.category].push(doc)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([category, docs]) => (
        <div key={category}>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            {category}
          </h4>
          <div className="space-y-2">
            {docs.map((doc) => {
              const badge = STATUS_BADGE[doc.status] || STATUS_BADGE.not_started
              return (
                <button
                  key={doc.doc_key}
                  onClick={() => onOpen(doc)}
                  className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{doc.title}</span>
                    {doc.tier === 'full' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 font-medium">
                        FULL
                      </span>
                    )}
                  </div>
                  <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${badge.className}`}>
                    <badge.Icon className="w-3 h-3" />
                    {badge.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
