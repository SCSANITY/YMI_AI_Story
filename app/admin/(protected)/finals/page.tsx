import { FinalReviewPanel } from '@/components/admin/FinalReviewPanel'

export default function FinalsPage() {
  return (
    <>
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Final Review</h1>
      </header>
      <FinalReviewPanel />
    </>
  )
}
