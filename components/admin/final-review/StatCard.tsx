export function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'sky' | 'violet' | 'amber' | 'emerald'
}) {
  const toneClass = {
    sky: 'from-sky-400/20 to-cyan-400/10 text-sky-100 border-sky-400/20',
    violet: 'from-violet-400/20 to-fuchsia-400/10 text-violet-100 border-violet-400/20',
    amber: 'from-amber-400/20 to-orange-400/10 text-amber-100 border-amber-400/20',
    emerald: 'from-emerald-400/20 to-lime-400/10 text-emerald-100 border-emerald-400/20',
  }[tone]

  return (
    <div className={`rounded-[22px] border bg-gradient-to-br px-4 py-4 ${toneClass}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  )
}
