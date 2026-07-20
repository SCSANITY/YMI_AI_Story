'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { GlobalProvider, useGlobalContext } from '@/contexts/GlobalContext'
import { Navbar } from '@/components/Navbar'
import { getTranslatedInternalNavigationHref } from '@/lib/browser-translation'
import {
  CUSTOMIZE_ACCESS_BLOCKED_EVENT,
  DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
} from '@/lib/customize-access'

const LoginModal = dynamic(() => import('@/components/LoginModal').then((module) => module.LoginModal), {
  ssr: false,
  loading: () => null,
})

const CookieConsentBanner = dynamic(
  () => import('@/components/CookieConsentBanner').then((module) => module.CookieConsentBanner),
  {
    ssr: false,
    loading: () => null,
  },
)

const CustomizeAccessBlockedModal = dynamic(
  () => import('@/components/CustomizeAccessBlockedModal').then((module) => module.CustomizeAccessBlockedModal),
  {
    ssr: false,
    loading: () => null,
  },
)

function LoginModalGate({ enabled }: { enabled: boolean }) {
  const { isLoginModalOpen } = useGlobalContext()

  if (!enabled || !isLoginModalOpen) return null
  return <LoginModal />
}

function CustomizeAccessBlockedModalGate({ enabled }: { enabled: boolean }) {
  const [initialMessage, setInitialMessage] = useState(DEFAULT_CUSTOMIZE_ACCESS_MESSAGE)
  const [shouldMountModal, setShouldMountModal] = useState(false)

  useEffect(() => {
    if (!enabled) return

    const handleOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>
      const nextMessage = String(customEvent.detail?.message ?? '').trim()
      setInitialMessage(nextMessage || DEFAULT_CUSTOMIZE_ACCESS_MESSAGE)
      setShouldMountModal(true)
    }

    window.addEventListener(CUSTOMIZE_ACCESS_BLOCKED_EVENT, handleOpen as EventListener)
    return () => window.removeEventListener(CUSTOMIZE_ACCESS_BLOCKED_EVENT, handleOpen as EventListener)
  }, [enabled])

  if (!enabled || !shouldMountModal) return null
  return <CustomizeAccessBlockedModal initialMessage={initialMessage} initiallyOpen />
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isMaintenanceRoute = pathname?.startsWith('/maintenance') ?? false
  const isPersonalizeRoute = pathname?.startsWith('/personalize/') ?? false
  const isAdminRoute = pathname?.startsWith('/admin') ?? false
  const showGlobalNav = !isMaintenanceRoute && !isPersonalizeRoute && !isAdminRoute

  const isHomePage = pathname === '/'

  useEffect(() => {
    const handleTranslatedNavigation = (event: MouseEvent) => {
      const href = getTranslatedInternalNavigationHref(event)
      if (!href) return

      event.preventDefault()
      event.stopPropagation()
      window.location.assign(href)
    }

    document.addEventListener('click', handleTranslatedNavigation, true)
    return () => document.removeEventListener('click', handleTranslatedNavigation, true)
  }, [])

  return (
    <GlobalProvider>
      {showGlobalNav ? <Navbar /> : null}
      <LoginModalGate enabled={!isMaintenanceRoute && !isAdminRoute} />
      {/* Home page: no pt-16. Hero fills the full viewport and manages its own spacing. */}
      <div className={showGlobalNav && !isHomePage ? 'pt-16' : undefined}>{children}</div>
      {!isMaintenanceRoute && !isAdminRoute ? <CookieConsentBanner /> : null}
      <CustomizeAccessBlockedModalGate enabled={!isMaintenanceRoute && !isAdminRoute} />
    </GlobalProvider>
  )
}
