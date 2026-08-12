import { GeneralInbox } from '@/components/admin/sections/inbox/GeneralInbox'
import { AdminPage, AdminPageHeader, AdminStatusBadge } from '@/components/admin/AdminUi'

export default function AdminGeneralInboxPage() {
  return (
    <AdminPage className="space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-0">
      <AdminPageHeader
        eyebrow="Root-domain mail"
        title="General Inbox"
        description="Review recognized root-domain mail that is not part of a verified Support thread."
        action={<AdminStatusBadge tone="neutral">Operational inbox</AdminStatusBadge>}
      />
      <div className="h-4 shrink-0" />
      <GeneralInbox />
    </AdminPage>
  )
}
