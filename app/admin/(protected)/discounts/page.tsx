import { DiscountManagementSection } from '@/components/admin/sections/DiscountManagementSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function DiscountsPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Commercial tools"
        title="Discounts"
      />
      <div className="max-w-6xl">
        <DiscountManagementSection />
      </div>
    </AdminPage>
  )
}
