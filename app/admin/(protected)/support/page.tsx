import { SupportInbox } from '@/components/admin/sections/support/SupportInbox'
import { AdminPage, AdminPageHeader, AdminStatusBadge } from '@/components/admin/AdminUi'

export default function AdminSupportPage() {
  return (
    <AdminPage className="space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-0">
      <AdminPageHeader
        eyebrow="Customer care"
        title="Support Inbox"
        description="Review customer questions and continue each verified support conversation by email."
        action={<AdminStatusBadge tone="info">Auto-refresh: 15 seconds</AdminStatusBadge>}
      />
      <div className="h-4 shrink-0" />
      <SupportInbox />
    </AdminPage>
  )
}
