import { Signal, SignalSet } from '../types'
import { Tag, HelpCircle, AlertTriangle } from 'lucide-react'

interface Props {
  signals: SignalSet
}

const SIGNAL_COLORS: Record<string, string> = {
  DC: 'bg-purple-100 text-purple-700',
  PS: 'bg-red-100 text-red-400',
  BI: 'bg-yellow-100 text-yellow-700',
  DN: 'bg-ax-primary/20 text-ax-primary-light',
  CP: 'bg-emerald-500/15 text-emerald-400',
  BQ: 'bg-ax-primary/20 text-ax-primary-light',
  PG: 'bg-orange-100 text-orange-700',
}

function SignalBadge({ id }: { id: string }) {
  const prefix = id.replace(/[0-9]/g, '')
  const color = SIGNAL_COLORS[prefix] || 'bg-ax-bg-3 text-ax-text-dim'
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono font-medium ${color}`}>{id}</span>
}

function SignalGroup({ title, icon, signals }: { title: string; icon: React.ReactNode; signals: Signal[] }) {
  if (!signals || signals.length === 0) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h4 className="text-sm font-semibold text-ax-text-dim">{title} ({signals.length})</h4>
      </div>
      <div className="space-y-2">
        {signals.map((signal) => (
          <div key={signal.id} className="flex items-start gap-3 p-3 bg-ax-bg-3 rounded-lg">
            <SignalBadge id={signal.id} />
            <div className="flex-1">
              <p className="text-sm text-ax-text">{signal.text}</p>
              <p className="text-xs text-ax-text-muted mt-1">
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
      <h3 className="font-medium text-ax-text">Extracted Signals</h3>

      <SignalGroup
        title="Structural Signals"
        icon={<Tag className="w-4 h-4 text-ax-text-muted" />}
        signals={signals.structural || []}
      />

      <SignalGroup
        title="Business Questions"
        icon={<HelpCircle className="w-4 h-4 text-ax-primary-light" />}
        signals={signals.business_questions || []}
      />

      <SignalGroup
        title="Process Gaps"
        icon={<AlertTriangle className="w-4 h-4 text-orange-500" />}
        signals={signals.process_gaps || []}
      />

      <SignalGroup
        title="Contextual Signals"
        icon={<Tag className="w-4 h-4 text-ax-text-muted" />}
        signals={signals.contextual || []}
      />
    </div>
  )
}
