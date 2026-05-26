'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { GlobalProvider } from '@/contexts/GlobalContext'
import { Navbar } from '@/components/Navbar'
import { LoginModal } from '@/components/LoginModal'
import { CookieConsentBanner } from '@/components/CookieConsentBanner'
import { CustomizeAccessBlockedModal } from '@/components/CustomizeAccessBlockedModal'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMaintenanceRoute = pathname?.startsWith('/maintenance') ?? false
  const isPersonalizeRoute = pathname?.startsWith('/personalize/') ?? false
  const isAdminRoute = pathname?.startsWith('/admin') ?? false
  const showGlobalNav = !isMaintenanceRoute && !isPersonalizeRoute && !isAdminRoute

  const isHomePage = pathname === '/'

  return (
    <GlobalProvider>
      {showGlobalNav ? <Navbar /> : null}
      {!isMaintenanceRoute && !isAdminRoute ? <LoginModal /> : null}
      {/* Home page: no pt-16 — Hero fills the full viewport and manages its own spacing */}
      <div className={showGlobalNav && !isHomePage ? 'pt-16' : undefined}>{children}</div>
      {!isMaintenanceRoute && !isAdminRoute ? <CookieConsentBanner /> : null}
      {!isMaintenanceRoute && !isAdminRoute ? <CustomizeAccessBlockedModal /> : null}
    </GlobalProvider>
  )
}
