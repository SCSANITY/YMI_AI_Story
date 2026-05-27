import React from 'react'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'

/**
 * Protected admin layout — THE single auth guard for all /admin/* pages.
 *
 * Any route under app/admin/(protected)/ inherits this layout.
 * The (protected) route group is invisible in the URL — routes are still /admin/finals etc.
 *
 * Auth logic:
 *   - Not authenticated OR not admin role → redirect to /admin/login
 *   - Admin → render AdminShell (sidebar + content)
 *
 * API routes retain their own requireAdminCustomer() calls as the server-side security
 * boundary — this layout only gates page-level access.
 */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminCustomer()
  if (!admin) redirect('/admin/login')

  return (
    <AdminShell
      adminName={admin.display_name || admin.email || 'Admin'}
      adminEmail={admin.email || ''}
    >
      {children}
    </AdminShell>
  )
}
