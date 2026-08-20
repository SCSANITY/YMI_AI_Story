import { AnnouncementsSection } from '@/components/admin/sections/AnnouncementsSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function AnnouncementsPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Publishing"
        title="Announcements"
      />
      <AnnouncementsSection />
    </AdminPage>
  )
}
