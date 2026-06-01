import { OrdersManagementSection } from '@/components/admin/sections/OrdersManagementSection'

export default function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">YMI Admin</p>
        <h1 className="mt-0.5 text-2xl font-bold text-white">Orders</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Manage order logistics status and tracking details. Status changes send customer logistics emails through
          the delivery sender.
        </p>
      </div>
      <OrdersManagementSection />
    </div>
  )
}
