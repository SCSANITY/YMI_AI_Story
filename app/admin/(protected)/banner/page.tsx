import { HomepageBannerManager } from '@/components/admin/sections/banners/HomepageBannerManager'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function BannerPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Publishing"
        title="Homepage Banners"
        description="Manage the three Banner positions on Home."
      />
      <HomepageBannerManager />
    </AdminPage>
  )
}
