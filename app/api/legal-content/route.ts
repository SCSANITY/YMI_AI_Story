import { noStoreJson } from '@/lib/http-response'
import { getPublishedLegalContentSnapshot } from '@/lib/published-legal-content'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const content = await getPublishedLegalContentSnapshot()
    return noStoreJson({ content })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Published legal content is unavailable'
    return noStoreJson({ error: message }, 500)
  }
}
