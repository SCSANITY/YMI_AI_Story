import {
  BarChart3,
  BookMarked,
  FileText,
  LayoutDashboard,
  Mail,
  Mails,
  Megaphone,
  MessagesSquare,
  PackageCheck,
  ScrollText,
  TicketPercent,
  ToggleLeft,
  type LucideIcon,
} from 'lucide-react'

export type AdminNavigationGroup = 'Review' | 'Communication' | 'Growth' | 'System'

export type AdminNavigationItem = {
  label: string
  shortLabel: string
  icon: LucideIcon
  href: string
  group: AdminNavigationGroup
  soon?: boolean
}

export const adminNavigationItems: AdminNavigationItem[] = [
  { label: 'Final Review', shortLabel: 'Finals', icon: FileText, href: '/admin/finals', group: 'Review' },
  { label: 'Orders', shortLabel: 'Orders', icon: PackageCheck, href: '/admin/orders', group: 'Review' },
  { label: 'Support Inbox', shortLabel: 'Support', icon: MessagesSquare, href: '/admin/support', group: 'Communication' },
  { label: 'General Inbox', shortLabel: 'Inbox', icon: Mails, href: '/admin/inbox', group: 'Communication' },
  { label: 'Discounts', shortLabel: 'Discounts', icon: TicketPercent, href: '/admin/discounts', group: 'Growth' },
  { label: 'Email Events', shortLabel: 'Emails', icon: Mail, href: '/admin/emails', group: 'Growth' },
  { label: 'Announcements', shortLabel: 'News', icon: Megaphone, href: '/admin/announcements', group: 'Growth' },
  { label: 'Service Control', shortLabel: 'Services', icon: ToggleLeft, href: '/admin/service', group: 'System' },
  { label: 'Legal Content', shortLabel: 'Legal', icon: ScrollText, href: '/admin/legal', group: 'System' },
  { label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3, href: '/admin/analytics', group: 'System', soon: true },
  { label: 'Banner Manager', shortLabel: 'Banner', icon: LayoutDashboard, href: '/admin/banner', group: 'System', soon: true },
  { label: 'Catalog', shortLabel: 'Catalog', icon: BookMarked, href: '/admin/catalog', group: 'System', soon: true },
]

export const ADMIN_NAVIGATION_GROUPS: AdminNavigationGroup[] = [
  'Review',
  'Communication',
  'Growth',
  'System',
]

export function getAdminNavigationGroups() {
  return ADMIN_NAVIGATION_GROUPS.map((group) => ({
    group,
    items: adminNavigationItems.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0)
}

export function getAdminNavigationItem(pathname: string) {
  return adminNavigationItems.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  )
}
