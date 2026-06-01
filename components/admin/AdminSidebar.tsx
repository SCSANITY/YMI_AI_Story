'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  BookMarked,
  FileText as FileTextIcon,
  LayoutDashboard,
  Mail,
  Megaphone,
  PackageCheck,
  TicketPercent,
  ToggleLeft,
} from 'lucide-react'

const navItems = [
  { label: 'Final Review',    icon: FileTextIcon,    href: '/admin/finals' },
  { label: 'Announcements',   icon: Megaphone,       href: '/admin/announcements' },
  { label: 'Discounts',       icon: TicketPercent,   href: '/admin/discounts' },
  { label: 'Emails',          icon: Mail,            href: '/admin/emails' },
  { label: 'Orders',          icon: PackageCheck,    href: '/admin/orders' },
  { label: 'Service Control', icon: ToggleLeft,      href: '/admin/service' },
  { label: 'Analytics',       icon: BarChart3,       href: '/admin/analytics',     soon: true },
  { label: 'Banner Manager',  icon: LayoutDashboard, href: '/admin/banner',         soon: true },
  { label: 'Catalog',         icon: BookMarked,      href: '/admin/catalog',        soon: true },
]

type Props = {
  adminName: string
  adminEmail: string
}

export function AdminSidebar({ adminName, adminEmail }: Props) {
  const pathname = usePathname()

  return (
    <aside className="flex flex-col border-b border-white/10 bg-slate-950/80 p-4 backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:p-5">
      {/* Logo / brand */}
      <div className="flex items-center gap-3 rounded-3xl bg-white/[0.06] p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-lg font-black text-slate-950">
          Y
        </div>
        <div>
          <p className="text-sm font-bold">YMI Admin</p>
          <p className="text-xs text-slate-500">Internal dashboard</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="mt-6 flex-1 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition ${
                isActive
                  ? 'bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/20'
                  : item.soon
                    ? 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-400'
                    : 'text-slate-200 hover:bg-white/[0.08]'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? '' : item.soon ? 'text-slate-600' : 'text-slate-400'
                }`}
              />
              {item.label}
              {item.soon ? (
                <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wide text-slate-600">
                  Soon
                </span>
              ) : null}
            </Link>
          )
        })}
      </nav>

      {/* Admin identity - pinned to the shared sidebar bottom */}
      <div className="mt-auto border-t border-white/[0.08] pt-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400/50 to-orange-500/50 text-sm font-bold text-white">
            {adminName[0]?.toUpperCase() ?? 'A'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{adminName}</p>
            {adminEmail ? <p className="truncate text-[10px] text-slate-500">{adminEmail}</p> : null}
          </div>
        </div>
      </div>
    </aside>
  )
}
