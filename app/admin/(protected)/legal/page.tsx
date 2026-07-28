import { LegalContentSection } from '@/components/admin/sections/LegalContentSection'

export default function LegalContentPage() {
  return (
    <>
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
          YMI Admin
        </p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Legal Content</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Prepare, preview, publish, and restore revisioned policy content.
        </p>
      </header>
      <LegalContentSection />
    </>
  )
}
