import { CatalogPricingManager } from '@/components/admin/CatalogPricingManager'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function CatalogPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Commerce"
        title="Catalog Pricing"
        description="Manage the USD list price and optional sale price for each customer-facing book package."
      />
      <CatalogPricingManager />
    </AdminPage>
  )
}
