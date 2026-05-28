import React from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin',
}

/**
 * Admin layout root — minimal passthrough.
 *
 * Provides a clean layout root for all /admin/* routes.
 * Each sub-layout handles its own structure:
 *   - /admin/login     → AdminLoginClient (self-contained bg)
 *   - /admin/(protected) → AdminShell (grid + sidebar + bg)
 *
 * Future: Add admin-scoped providers (toast, modals) here.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
