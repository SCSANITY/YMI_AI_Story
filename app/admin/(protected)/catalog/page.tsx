export default function CatalogPage() {
  return (
    <>
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Catalog</h1>
      </header>
      <section className="rounded-[26px] border border-white/10 bg-white/[0.06] p-8 shadow-[0_22px_70px_rgba(0,0,0,0.24)] backdrop-blur-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-300">Book Catalog</p>
        <h2 className="mt-1 text-2xl font-bold text-white">Template management</h2>
        <p className="mt-3 max-w-lg text-sm leading-6 text-slate-400">
          Add, remove, and configure story templates directly from the dashboard. Planned features:
          pricing editor, config file management, coming-soon toggles, and cover image uploads — all
          writing directly to the <span className="font-mono text-slate-300">templates</span> table.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-xs font-semibold text-slate-500">
          Coming soon
        </div>
      </section>
    </>
  )
}
