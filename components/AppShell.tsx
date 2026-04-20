'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { GlobalProvider } from '@/contexts/GlobalContext'
import { Navbar } from '@/components/Navbar'
import { LoginModal } from '@/components/LoginModal'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMaintenanceRoute = pathname?.startsWith('/maintenance') ?? false
  const isPersonalizeRoute = pathname?.startsWith('/personalize/') ?? false
  const showGlobalNav = !isMaintenanceRoute && !isPersonalizeRoute

  return (
    <GlobalProvider>
      {showGlobalNav ? <Navbar /> : null}
      {!isMaintenanceRoute ? <LoginModal /> : null}
      <div className={showGlobalNav ? 'pt-16' : undefined}>{children}</div>
    </GlobalProvider>
  )
}
