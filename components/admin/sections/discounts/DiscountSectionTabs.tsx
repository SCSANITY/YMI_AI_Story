import Link from 'next/link'

export type DiscountSection = 'instruments' | 'shipping'

const SECTIONS = [
  { id: 'instruments', label: 'Promo codes & vouchers', href: '/admin/discounts' },
  { id: 'shipping', label: 'Shipping discount', href: '/admin/discounts?view=shipping' },
] as const

export function DiscountSectionTabs({ activeSection }: { activeSection: DiscountSection }) {
  return (
    <nav aria-label="Discount sections" className="admin-v2-panel grid grid-cols-2 gap-1 p-1.5">
      {SECTIONS.map(section => (
        <Link key={section.id} href={section.href} aria-current={section.id === activeSection ? 'page' : undefined}
          className={`flex min-h-11 min-w-0 items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent)] ${
            section.id === activeSection ? 'bg-[var(--admin-page-ink)] text-white shadow-sm'
              : 'text-[var(--admin-page-muted)] hover:bg-black/[0.04] hover:text-[var(--admin-page-ink)]'
          }`}>
          {section.label}
        </Link>
      ))}
    </nav>
  )
}
