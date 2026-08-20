import { CatalogPricingManager } from '@/components/admin/CatalogPricingManager'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function CatalogPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Commerce"
        title="Catalog Pricing"
      />
      <CatalogPricingManager />
    </AdminPage>
  )
}
