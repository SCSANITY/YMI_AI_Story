import { HomepageBannerManager } from '@/components/admin/sections/banners/HomepageBannerManager'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function BannerPage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Publishing"
        title="Homepage Banners"
        description="Preview and publish independent Desktop and Mobile artwork across the three fixed Home positions."
      />
      <HomepageBannerManager />
    </AdminPage>
  )
}
