import type { BookPackageType } from '@/types'
import type { FinalProductionMode } from '@/lib/final-production'

const pill = 'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold leading-4'

export function FinalBookBadges({ mode, edition }: {
  mode?: FinalProductionMode
  edition?: BookPackageType | 'digital' | null
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className={pill + ' bg-[var(--admin-panel-2)] text-[var(--admin-muted)]'}>
        {mode === 'manual' ? 'Handmade' : 'Auto'}
      </span>
      {edition === 'digital' ? (
        <span className={pill + ' bg-sky-100 text-sky-900'}>PDF only</span>
      ) : edition === 'basic' ? (
        <span className={pill + ' bg-amber-100 text-amber-900'}>Hardcover</span>
      ) : edition === 'supreme' ? (
        <span className={pill + ' bg-violet-100 text-violet-900'}>Hardcover + Voice</span>
      ) : edition === null ? (
        <span className={pill + ' bg-[var(--admin-panel-2)] text-[var(--admin-muted)]'}>Edition unverified</span>
      ) : null}
    </div>
  )
}
