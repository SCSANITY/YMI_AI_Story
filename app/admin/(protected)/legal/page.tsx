import { LegalContentSection } from '@/components/admin/sections/LegalContentSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function LegalContentPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Publishing"
        title="Legal Content"
      />
      <LegalContentSection />
    </AdminPage>
  )
}
