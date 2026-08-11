import { GeneralInbox } from '@/components/admin/sections/inbox/GeneralInbox'

export default function AdminGeneralInboxPage() {
  return (
    <div className="xl:flex xl:h-[calc(100dvh-3rem)] xl:min-h-0 xl:flex-col">
      <header className="mb-5 xl:shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
        <div className="mt-0.5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">General Inbox</h1>
            <p className="mt-1 text-sm text-slate-400">
              Review recognized root-domain mail that is not a verified Support thread.
            </p>
          </div>
          <p className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[10px] text-slate-500">
            Operational minimum surface
          </p>
        </div>
      </header>
      <GeneralInbox />
    </div>
  )
}
