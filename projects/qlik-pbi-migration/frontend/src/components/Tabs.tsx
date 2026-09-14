export interface TabDef {
  id: string
  label: string
}

export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
}) {
  return (
    <div className="border-b border-ax-border mb-6">
      <nav className="flex gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              active === tab.id
                ? 'border-ax-primary text-ax-primary-light'
                : 'border-transparent text-ax-text-muted hover:text-ax-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
