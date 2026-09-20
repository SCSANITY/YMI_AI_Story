export function CheckoutLoadingShell() {
  return (
    <main
      className="page-surface min-h-screen px-3 py-6 sm:px-4 md:px-8 md:py-10"
      aria-busy="true"
      aria-label="Loading checkout"
      data-checkout-loading-shell="true"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-amber-100 motion-reduce:animate-none" />
          <div className="space-y-2">
            <div className="h-7 w-44 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
          <section className="rounded-[28px] border border-white/75 bg-white/78 p-4 shadow-[0_20px_55px_rgba(97,67,33,0.09)] sm:p-6">
            <div className="mb-6 h-6 w-40 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className={index > 5 ? 'sm:col-span-2' : ''}>
                  <div className="mb-2 h-3 w-20 animate-pulse rounded-full bg-amber-100 motion-reduce:animate-none" />
                  <div className="h-12 animate-pulse rounded-2xl border border-slate-100 bg-slate-50 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </section>
          <aside className="h-fit rounded-[28px] border border-white/75 bg-white/78 p-5 shadow-[0_20px_55px_rgba(97,67,33,0.09)] sm:p-6">
            <div className="h-6 w-32 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
            <div className="mt-6 flex gap-4">
              <div className="h-24 w-20 animate-pulse rounded-xl bg-amber-50 motion-reduce:animate-none" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-4 w-4/5 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
                <div className="h-3 w-2/5 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
                <div className="h-3 w-3/5 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
              </div>
            </div>
            <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
              <div className="h-3 w-full animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
              <div className="h-5 w-2/3 animate-pulse rounded-full bg-amber-100 motion-reduce:animate-none" />
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
