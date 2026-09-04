import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  bootstrapAdminLegalDocuments,
  listAdminLegalDocuments,
} from '@/lib/legal-publishing-store'
import { invalidatePublishedLegalContent } from '@/lib/legal-content-cache'

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, 403)

  try {
    const documents = await listAdminLegalDocuments()
    return jsonNoStore({ documents })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load legal documents'
    return jsonNoStore({ error: message }, 500)
  }
}

export async function POST() {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, 403)

  try {
    const documents = await bootstrapAdminLegalDocuments(admin.customer_id)
    invalidatePublishedLegalContent()
    return jsonNoStore({ documents }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize legal documents'
    return jsonNoStore({ error: message }, 500)
  }
}
