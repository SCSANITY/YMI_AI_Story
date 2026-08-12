import React from 'react'
import { AdminCommandBar } from '@/components/admin/AdminCommandBar'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

type Props = {
  adminName: string
  adminEmail: string
  children: React.ReactNode
}

/**
 * AdminShell — Server Component (Admin V3 warm-glass console)
 *
 * A single rounded application panel floating on the warm gradient canvas:
 *   [ grouped sidebar (214px) | main( top bar + one content scroll owner ) ]
 *
 * Auth guard lives in app/admin/(protected)/layout.tsx, not here.
 * Desktop keeps one bounded workspace scroll owner; mobile keeps document flow
 * with the sticky command header + accessible nav drawer (AdminSidebar).
 */
export function AdminShell({ adminName, adminEmail, children }: Props) {
  return (
    <main className="ymi-admin-theme min-h-dvh max-w-full overflow-x-clip p-[clamp(6px,0.7vw,11px)] text-[var(--admin-ink)] lg:h-dvh lg:overflow-hidden">
      <div className="admin-app mx-auto grid min-h-[calc(100dvh-1.4rem)] w-full min-w-0 max-w-[1720px] lg:h-full lg:min-h-0 lg:grid-cols-[214px_minmax(0,1fr)]">
        <AdminSidebar adminName={adminName} adminEmail={adminEmail} />
        <div className="flex min-w-0 max-w-full flex-col lg:h-full lg:min-h-0">
          <AdminCommandBar />
          <section className="admin-v2-workspace min-w-0 max-w-full px-4 pb-7 pt-4 sm:px-5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-7 lg:py-6">
            <div className="min-h-0 min-w-0 max-w-full lg:h-full">{children}</div>
          </section>
        </div>
      </div>
    </main>
  )
}
