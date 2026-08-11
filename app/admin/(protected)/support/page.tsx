import { SupportInbox } from '@/components/admin/sections/support/SupportInbox'

export default function AdminSupportPage() {
  return (
    <div className="xl:flex xl:h-[calc(100dvh-3rem)] xl:min-h-0 xl:flex-col">
      <header className="mb-5 xl:shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
        <div className="mt-0.5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Support Inbox</h1>
            <p className="mt-1 text-sm text-slate-400">
              Review customer questions and continue each conversation by email.
            </p>
          </div>
          <p className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] text-slate-500">
            Auto-refreshes every 15 seconds
          </p>
        </div>
      </header>
      <SupportInbox />
    </div>
  )
}
