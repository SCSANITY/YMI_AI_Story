export function StatCard({
  label,
  value,
  tone,
  active,
  onSelect,
}: {
  label: string
  value: number
  tone: 'neutral' | 'sky' | 'amber' | 'emerald'
  active: boolean
  onSelect: () => void
}) {
  const gradient = {
    neutral: 'linear-gradient(142deg,#e9dcc2,#d3c19f)',
    sky: 'var(--admin-grad-peach)',
    amber: 'var(--admin-grad-gold)',
    emerald: 'var(--admin-grad-sage)',
  }[tone]

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      style={{ background: gradient }}
      className={`flex min-w-[8.5rem] flex-1 flex-col justify-between gap-2 rounded-2xl px-4 py-3 text-left text-[#2a2410] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-panel)] sm:min-w-0 ${
        active
          ? '-translate-y-0.5 opacity-100 [filter:saturate(1.08)] shadow-[0_16px_32px_-20px_rgba(120,80,20,0.45)]'
          : 'opacity-[0.48] [filter:saturate(0.6)] hover:-translate-y-0.5 hover:opacity-80'
      }`}
    >
      <span className="block text-[11px] font-bold uppercase leading-4 tracking-[0.1em] opacity-80">
        {label}
      </span>
      <span className="block text-3xl font-black leading-none tabular-nums">{value}</span>
    </button>
  )
}
