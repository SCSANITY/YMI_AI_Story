import { AdminPage, AdminPageHeader, AdminPanel, AdminStatusBadge } from '@/components/admin/AdminUi'

export default function AnalyticsPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader eyebrow="Insights" title="Analytics" />
      <AdminPanel className="p-6 sm:p-8">
        <h2 className="text-xl font-bold text-[var(--admin-page-ink)]">Sales Analytics</h2>
        <AdminStatusBadge tone="neutral" className="mt-5">
          Coming soon
        </AdminStatusBadge>
      </AdminPanel>
    </AdminPage>
  )
}
