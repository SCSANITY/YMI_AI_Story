import { OrdersManagementSection } from '@/components/admin/sections/OrdersManagementSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function AdminOrdersPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Fulfillment"
        title="Orders"
        description="Manage logistics status and tracking details. Committed status changes continue through the existing customer email workflow."
      />
      <OrdersManagementSection />
    </AdminPage>
  )
}
