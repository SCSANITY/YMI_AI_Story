import React from 'react'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

type Props = {
  adminName: string
  adminEmail: string
  children: React.ReactNode
}

/**
 * AdminShell — Server Component
 *
 * Provides the outer grid layout for all protected admin pages:
 *   [ sidebar (18rem) | content (flex-1) ]
 *
 * Auth guard lives in app/admin/(protected)/layout.tsx, not here.
 * AdminSidebar is a Client Component (needs usePathname).
 */
export function AdminShell({ adminName, adminEmail, children }: Props) {
  return (
    <main className="min-h-screen bg-[#0b1120] text-white">
      <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
        <AdminSidebar adminName={adminName} adminEmail={adminEmail} />
        <section className="min-w-0 p-4 lg:p-6">
          {children}
        </section>
      </div>
    </main>
  )
}
