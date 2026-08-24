import { Signal, SignalSet } from '../types'
import { Tag, HelpCircle, AlertTriangle } from 'lucide-react'

interface Props {
  signals: SignalSet
}

const SIGNAL_COLORS: Record<string, string> = {
  DC: 'bg-purple-100 text-purple-700',
  PS: 'bg-red-100 text-red-700',
  BI: 'bg-yellow-100 text-yellow-700',
  DN: 'bg-blue-100 text-blue-700',
  CP: 'bg-green-100 text-green-700',
  BQ: 'bg-indigo-100 text-indigo-700',
  PG: 'bg-orange-100 text-orange-700',
}

function SignalBadge({ id }: { id: string }) {
  const prefix = id.replace(/[0-9]/g, '')
  const color = SIGNAL_COLORS[prefix] || 'bg-gray-100 text-gray-700'
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium ${color}`}>{id}</span>
}

function SignalGroup({ title, icon, signals }: { title: string; icon: React.ReactNode; signals: Signal[] }) {
  if (!signals || signals.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm font-semibold text-gray-700">{title} ({signals.length})</h4>
      </div>
      <div className="space-y-2">
        {signals.map((signal) => (
          <div key={signal.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <SignalBadge id={signal.id} />
            <div className="flex-1">
              <p className="text-sm text-gray-800">{signal.text}</p>
              <p className="text-xs text-gray-400 mt-1">
                Source: {signal.source}
                {signal.derived && ' (derived)'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SignalReview({ signals }: Props) {
  return (
    <div className="space-y-6">
      <h3 className="font-medium text-gray-900">Extracted Signals</h3>

      <SignalGroup
        title="Structural Signals"
        icon={<Tag className="w-4 h-4 text-gray-500" />}
        signals={signals.structural || []}
      />

      <SignalGroup
        title="Business Questions"
        icon={<HelpCircle className="w-4 h-4 text-indigo-500" />}
        signals={signals.business_questions || []}
      />

      <SignalGroup
        title="Process Gaps"
        icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
        signals={signals.process_gaps || []}
      />

      <SignalGroup
        title="Contextual Signals"
        icon={<Tag className="w-4 h-4 text-gray-400" />}
        signals={signals.contextual || []}
      />
    </div>
  )
}
