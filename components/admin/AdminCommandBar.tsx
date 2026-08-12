'use client'

import { usePathname } from 'next/navigation'
import { getAdminNavigationItem } from '@/components/admin/adminNavigation'

export function AdminCommandBar() {
  const pathname = usePathname()
  const currentItem = getAdminNavigationItem(pathname)

  return (
    <header className="admin-v2-commandbar hidden min-h-14 shrink-0 items-center gap-4 px-4 lg:flex">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className="h-9 w-1 shrink-0 rounded-full bg-gradient-to-b from-[var(--admin-accent)] to-[var(--admin-accent-dp)]"
        />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--admin-muted)]">
            YMI Operations <span className="text-[var(--admin-accent-dp)]">·</span> {currentItem?.shortLabel || 'Admin'}
          </p>
          <h1 className="truncate text-[17px] font-bold leading-tight tracking-[-0.01em] text-[var(--admin-ink)]">
            {currentItem?.label || 'Operations Console'}
          </h1>
        </div>
      </div>
    </header>
  )
}
