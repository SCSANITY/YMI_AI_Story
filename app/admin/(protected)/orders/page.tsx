import { OrdersManagementSection } from '@/components/admin/sections/OrdersManagementSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'
import { isUuid } from '@/lib/validators'

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = searchParams ? await searchParams : {}
  const requestedOrderId = typeof params.order === 'string' ? params.order : null
  const initialOrderId = isUuid(requestedOrderId) ? requestedOrderId : null

  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Fulfillment"
        title="Orders"
      />
      <OrdersManagementSection initialOrderId={initialOrderId} />
    </AdminPage>
  )
}
