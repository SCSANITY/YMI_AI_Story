import { DiscountManagementSection } from '@/components/admin/sections/DiscountManagementSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'
import { DiscountSectionTabs } from '@/components/admin/sections/discounts/DiscountSectionTabs'
import { MultiBookOfferControl } from '@/components/admin/sections/discounts/MultiBookOfferControl'
import { ShippingDiscountControl } from '@/components/admin/sections/discounts/ShippingDiscountControl'

export default async function DiscountsPage({ searchParams }: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const { view } = await searchParams
  const activeSection = view === 'shipping' ? 'shipping' : view === 'multi-book' ? 'multi-book' : 'instruments'
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Commercial tools"
        title="Discounts"
      />
      <div className="max-w-6xl space-y-4">
        <DiscountSectionTabs activeSection={activeSection} />
        {activeSection === 'shipping'
          ? <ShippingDiscountControl />
          : activeSection === 'multi-book'
            ? <MultiBookOfferControl />
            : <DiscountManagementSection />}
      </div>
    </AdminPage>
  )
}
