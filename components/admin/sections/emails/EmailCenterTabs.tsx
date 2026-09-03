import Link from 'next/link'
import { Activity, LayoutGrid, Library } from 'lucide-react'

export type EmailCenterView = 'overview' | 'templates' | 'events'

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'templates', label: 'Template Library', icon: Library },
  { id: 'events', label: 'Delivery Events', icon: Activity },
] as const

export function EmailCenterTabs({ activeView }: { activeView: EmailCenterView }) {
  return (
    <nav
      aria-label="Email center sections"
      className="admin-v2-panel flex gap-1 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon
        const selected = tab.id === activeView
        return (
          <Link
            key={tab.id}
            href={`/admin/emails?view=${tab.id}`}
            aria-current={selected ? 'page' : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] focus-visible:ring-offset-2 ${
              selected
                ? 'bg-[var(--admin-page-ink)] text-white shadow-sm'
                : 'text-[var(--admin-page-muted)] hover:bg-black/[0.04] hover:text-[var(--admin-page-ink)]'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
