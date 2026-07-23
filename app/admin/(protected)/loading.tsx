export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading Admin section" className="animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-white/[0.08]" />
        <div className="h-8 w-48 max-w-full rounded bg-white/[0.1]" />
      </div>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="h-64 rounded-lg border border-white/[0.06] bg-white/[0.04]" />
        <div className="h-[28rem] max-h-[60dvh] rounded-lg border border-white/[0.06] bg-white/[0.04]" />
      </div>
      <span className="sr-only">Loading Admin section</span>
    </div>
  )
}
