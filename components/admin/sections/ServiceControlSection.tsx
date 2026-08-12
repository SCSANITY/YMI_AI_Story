import { CreatorPromoControl } from '@/components/admin/sections/service/CreatorPromoControl'
import { CustomizeAccessControl } from '@/components/admin/sections/service/CustomizeAccessControl'

export function ServiceControlSection() {
  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
      <CustomizeAccessControl />
      <CreatorPromoControl />
    </div>
  )
}
