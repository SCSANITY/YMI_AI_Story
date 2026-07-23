'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookMarked,
  FileText as FileTextIcon,
  LayoutDashboard,
  Mail,
  Menu,
  Megaphone,
  PackageCheck,
  TicketPercent,
  ToggleLeft,
  X,
} from 'lucide-react'

const navItems = [
  { label: 'Final Review', icon: FileTextIcon, href: '/admin/finals' },
  { label: 'Announcements', icon: Megaphone, href: '/admin/announcements' },
  { label: 'Discounts', icon: TicketPercent, href: '/admin/discounts' },
  { label: 'Emails', icon: Mail, href: '/admin/emails' },
  { label: 'Orders', icon: PackageCheck, href: '/admin/orders' },
  { label: 'Service Control', icon: ToggleLeft, href: '/admin/service' },
  { label: 'Analytics', icon: BarChart3, href: '/admin/analytics', soon: true },
  { label: 'Banner Manager', icon: LayoutDashboard, href: '/admin/banner', soon: true },
  { label: 'Catalog', icon: BookMarked, href: '/admin/catalog', soon: true },
]

type Props = {
  adminName: string
  adminEmail: string
}

function AdminIdentity({ adminName, adminEmail }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-400/25 text-sm font-bold text-amber-100">
        {adminName[0]?.toUpperCase() ?? 'A'}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-white">{adminName}</p>
        {adminEmail ? <p className="truncate text-[10px] text-slate-500">{adminEmail}</p> : null}
      </div>
    </div>
  )
}

function AdminNavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Admin sections" className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            onClick={onNavigate}
            className={`flex min-h-10 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
              isActive
                ? 'bg-amber-400 text-slate-950'
                : item.soon
                  ? 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-400'
                  : 'text-slate-200 hover:bg-white/[0.08]'
            }`}
          >
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 ${
                isActive ? '' : item.soon ? 'text-slate-600' : 'text-slate-400'
              }`}
            />
            <span className="min-w-0 truncate">{item.label}</span>
            {item.soon ? (
              <span className="ml-auto shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wide text-slate-600">
                Soon
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

export function AdminSidebar({ adminName, adminEmail }: Props) {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileDrawerRef = useRef<HTMLElement>(null)
  const mobileCloseRef = useRef<HTMLButtonElement>(null)
  const currentItem = useMemo(
    () => navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)),
    [pathname]
  )

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
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex min-h-16 min-w-0 items-center gap-3 px-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-sm font-black text-slate-950">
            Y
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">YMI Admin</p>
            <p className="truncate text-sm font-semibold text-white">{currentItem?.label || 'Dashboard'}</p>
          </div>
          <button
            ref={mobileTriggerRef}
            type="button"
            onClick={() => setIsMobileOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-slate-100 transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            aria-label="Open Admin navigation"
            aria-expanded={isMobileOpen}
            aria-controls="admin-mobile-navigation"
            title="Open navigation"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
      </header>

      <aside className="hidden h-dvh flex-col border-r border-white/10 bg-slate-950/80 p-5 backdrop-blur-2xl lg:sticky lg:top-0 lg:flex">
        <div className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.04] p-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-base font-black text-slate-950">
            Y
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">YMI Admin</p>
            <p className="text-xs text-slate-500">Internal dashboard</p>
          </div>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <AdminNavigationLinks pathname={pathname} />
        </div>

        <div className="mt-4 border-t border-white/[0.08] pt-4">
          <AdminIdentity adminName={adminName} adminEmail={adminEmail} />
        </div>
      </aside>

      {isMobileOpen ? (
        <div className="fixed inset-0 z-[180] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close Admin navigation"
          />
          <aside
            ref={mobileDrawerRef}
            id="admin-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 left-0 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col border-r border-white/10 bg-slate-950 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-[max(env(safe-area-inset-top),1rem)] shadow-2xl"
          >
            <div className="flex min-w-0 items-center gap-3 border-b border-white/[0.08] pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-400 text-base font-black text-slate-950">
                Y
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">YMI Admin</p>
                <p className="text-xs text-slate-500">Internal dashboard</p>
              </div>
              <button
                ref={mobileCloseRef}
                type="button"
                onClick={() => setIsMobileOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                aria-label="Close Admin navigation"
                title="Close navigation"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
              <AdminNavigationLinks pathname={pathname} onNavigate={() => setIsMobileOpen(false)} />
            </div>

            <div className="mt-4 border-t border-white/[0.08] pt-4">
              <AdminIdentity adminName={adminName} adminEmail={adminEmail} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )
}
