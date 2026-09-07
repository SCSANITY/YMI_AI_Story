import { requireAdminCustomer } from '@/lib/adminAuth'
import { getCustomizeAccessSettings, setCustomizeAccessEnabled } from '@/lib/customize-access-server'
import { noStoreJson } from '@/lib/http-response'

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return noStoreJson({ error: 'Admin access required' }, 403)
  }

  try {
    const customizeAccess = await getCustomizeAccessSettings({ failOnError: true })
    return noStoreJson({ customizeAccess })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load customize access'
    return noStoreJson({ error: message }, 500)
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return noStoreJson({ error: 'Admin access required' }, 403)
  }

  const body = await request.json().catch(() => ({}))
  const enabled = Boolean(body?.enabled)

  try {
    const customizeAccess = await setCustomizeAccessEnabled(enabled, admin.customer_id)
    return noStoreJson({ customizeAccess })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update customize access'
    return noStoreJson({ error: message }, 500)
  }
}
