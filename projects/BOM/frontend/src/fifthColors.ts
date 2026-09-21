const MAP: Record<string, string> = {
  powertrain: '#C0392B',
  platform: '#627384',
  module: '#1FA187',
  modules: '#1FA187',
  'top hat': '#EF7D1A',
  'tc&other': '#95A5A6',
  'tc & other': '#95A5A6',
  other: '#95A5A6',
}

export function colorForFifth(label: string, idx: number): string {
  const key = label.toLowerCase().trim()
  if (MAP[key]) return MAP[key]
  const fallback = ['#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5']
  return fallback[idx % fallback.length]
}
