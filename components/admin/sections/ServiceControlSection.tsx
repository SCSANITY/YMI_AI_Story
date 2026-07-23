import { CreatorPromoControl } from '@/components/admin/sections/service/CreatorPromoControl'
import { CustomizeAccessControl } from '@/components/admin/sections/service/CustomizeAccessControl'

export function ServiceControlSection() {
  return (
    <div className="space-y-4">
      <CustomizeAccessControl />
      <CreatorPromoControl />
    </div>
  )
}
