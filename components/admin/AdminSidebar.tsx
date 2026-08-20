'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { getAdminNavigationGroups } from '@/components/admin/adminNavigation'
import { ADMIN_KOL_ATTENTION_REFRESH_EVENT } from '@/lib/kol-partnerships'

type Props = {
  adminName: string
  adminEmail: string
}

function AdminIdentity({ adminName, adminEmail }: Props) {
  return (
    <div className="admin-v2-nav-identity flex min-w-0 items-center gap-3 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-accent)] text-sm font-black text-[var(--admin-accent-ink)]">
        {adminName[0]?.toUpperCase() ?? 'A'}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-[var(--admin-ink)]">{adminName}</p>
        {adminEmail ? (
          <p className="truncate text-[10px] text-[var(--admin-muted)]">{adminEmail}</p>
        ) : null}
      </div>
    </div>
  )
}

function AdminNavigationLinks({
  pathname,
  onNavigate,
  kolAttentionCount,
}: {
  pathname: string
  onNavigate?: () => void
  kolAttentionCount: number
}) {
  const groups = useMemo(() => getAdminNavigationGroups(), [])
  return (
    <nav aria-label="Admin sections" className="space-y-4">
      {groups.map((section) => (
        <div key={section.group} className="space-y-1">
          <p className="admin-v3-group py-1">{section.group}</p>
          {section.items.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                onClick={onNavigate}
                className={`admin-v2-nav-link flex min-h-9 w-full min-w-0 items-center gap-2.5 px-2.5 py-2 text-left text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] ${
                  isActive
                    ? 'admin-v2-nav-link--active'
                    : item.soon
                      ? 'text-[var(--admin-muted)] opacity-70'
                      : ''
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{item.label}</span>
                {item.attention === 'kol-partnerships' && kolAttentionCount > 0 ? (
                  <span
                    className="ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--admin-accent)] px-1.5 py-0.5 text-[9px] font-black text-[var(--admin-accent-ink)]"
                    aria-label={`${kolAttentionCount} partnership applications need attention`}
                  >
                    {kolAttentionCount > 99 ? '99+' : kolAttentionCount}
                  </span>
                ) : null}
                {item.soon ? (
                  <span className="ml-auto shrink-0 rounded-full bg-[var(--admin-panel-2)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--admin-muted)]">
                    Soon
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export function AdminSidebar({ adminName, adminEmail }: Props) {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLElement>(null)
  const mobileCloseRef = useRef<HTMLButtonElement>(null)
  const attentionIntentRef = useRef(0)
  const [kolAttentionCount, setKolAttentionCount] = useState(0)
  const loadKolAttentionCount = useCallback(async () => {
    const intent = ++attentionIntentRef.current
    try {
      const response = await fetch('/api/admin/kol-partnerships?view=attention_count', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || attentionIntentRef.current !== intent) return
      const count = Number(data?.attentionCount)
      if (Number.isSafeInteger(count) && count >= 0) setKolAttentionCount(count)
    } catch {
      // Keep the last known badge until focus/poll retries.
    }
  }, [])

  useEffect(() => {
    const refresh = () => void loadKolAttentionCount()
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    window.addEventListener(ADMIN_KOL_ATTENTION_REFRESH_EVENT, refresh)
    return () => {
      attentionIntentRef.current += 1
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(ADMIN_KOL_ATTENTION_REFRESH_EVENT, refresh)
    }
  }, [loadKolAttentionCount])

  useEffect(() => {
    if (!isMobileOpen) return
    const previousOverflow = document.body.style.overflow
    const mobileTrigger = mobileTriggerRef.current
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = mobileDrawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    mobileCloseRef.current?.focus()
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      mobileTrigger?.focus()
    }
  }, [isMobileOpen])

  return (
    <>
      <header className="admin-v2-mobilebar sticky top-0 z-40 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex min-h-16 min-w-0 items-center gap-3 px-3">
          <Image
            src="/logo.webp"
            alt="YMI Story"
            width={512}
            height={436}
            priority
            className="h-9 w-auto shrink-0"
          />
          <div className="min-w-0 flex-1" />
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="admin-v2-mobile-menu relative inline-flex h-10 w-10 shrink-0 items-center justify-center text-[var(--admin-ink)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]"
            aria-label="Open Admin navigation"
            aria-expanded={isMobileOpen}
            aria-controls="admin-mobile-navigation"
            title="Open navigation"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
            {kolAttentionCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--admin-accent-dp)]" aria-hidden="true" />
            ) : null}
          </button>
        </div>
      </header>

      <aside className="admin-v2-sidebar hidden min-h-0 flex-col gap-1 p-3 lg:flex lg:h-full">
        <div className="admin-v2-brand flex items-center gap-3 p-3">
          <Image
            src="/logo.webp"
            alt="YMI Story"
            width={512}
            height={436}
            priority
            className="h-10 w-auto shrink-0"
          />
          <div className="min-w-0 border-l border-[var(--admin-side-line)] pl-3">
            <p className="truncate text-sm font-bold text-[var(--admin-ink)]">Operations</p>
            <p className="text-xs text-[var(--admin-muted)]">Internal console</p>
          </div>
        </div>

        <div className="admin-v2-nav-scroll mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          <AdminNavigationLinks pathname={pathname} kolAttentionCount={kolAttentionCount} />
        </div>

        <div className="mt-2 shrink-0">
          <AdminIdentity adminName={adminName} adminEmail={adminEmail} />
        </div>
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-[180] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close Admin navigation"
          />
          <aside
            ref={mobileDrawerRef}
            id="admin-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="admin-v2-drawer absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)]"
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-[var(--admin-side-line)] pb-4">
              <Image
                src="/logo.webp"
                alt="YMI Story"
                width={512}
                height={436}
                priority
                className="h-11 w-auto shrink-0"
              />
              <div className="min-w-0 flex-1 border-l border-[var(--admin-side-line)] pl-3">
                <p className="truncate text-sm font-bold text-[var(--admin-ink)]">Operations</p>
                <p className="text-xs text-[var(--admin-muted)]">Internal console</p>
              </div>
              <button
                ref={mobileCloseRef}
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--admin-card-line)] text-[var(--admin-ink-soft)] transition hover:text-[var(--admin-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)]"
                aria-label="Close Admin navigation"
                title="Close navigation"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <AdminNavigationLinks pathname={pathname} onNavigate={() => setIsMobileOpen(false)} kolAttentionCount={kolAttentionCount} />
            </div>

            <div className="mt-4 border-t border-[var(--admin-side-line)] pt-4">
              <AdminIdentity adminName={adminName} adminEmail={adminEmail} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
