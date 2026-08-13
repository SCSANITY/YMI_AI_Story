import { AdminPage, AdminPageHeader, AdminStatusBadge } from '@/components/admin/AdminUi'
import { KolPartnershipWorkspace } from '@/components/admin/sections/kol/KolPartnershipWorkspace'

export default function AdminPartnershipsPage() {
  return (
    <AdminPage className="space-y-4 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-0">
      <AdminPageHeader
        eyebrow="Growth"
        title="KOL Partnerships"
        description="Review account-owned creator applications, qualification state, assignment, and internal notes."
        action={<AdminStatusBadge tone="info">Auto-refresh: 30 seconds</AdminStatusBadge>}
      />
      <div className="h-4 shrink-0" />
      <KolPartnershipWorkspace />
    </AdminPage>
  )
}
