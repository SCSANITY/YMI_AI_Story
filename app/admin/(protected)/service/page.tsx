import { ServiceControlSection } from '@/components/admin/sections/ServiceControlSection'
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminUi'

export default function ServicePage() {
  return (
    <AdminPage className="space-y-5">
      <AdminPageHeader
        eyebrow="Runtime controls"
        title="Service Control"
      />
      <div className="max-w-5xl">
        <ServiceControlSection />
      </div>
    </AdminPage>
  )
}
