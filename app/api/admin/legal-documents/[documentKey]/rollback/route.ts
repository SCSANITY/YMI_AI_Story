import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  LegalPublishingConflictError,
  LegalPublishingValidationError,
} from '@/lib/legal-publishing'
import {
  isCanonicalLegalDocumentKey,
  rollbackAdminLegalRevision,
} from '@/lib/legal-publishing-store'
import { invalidatePublishedLegalContent } from '@/lib/legal-content-cache'

type RouteContext = {
  params: Promise<{ documentKey: string }> | { documentKey: string }
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function isUuid(value: unknown) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(request: Request, context: RouteContext) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, 403)

  const { documentKey } = await Promise.resolve(context.params)
  if (!isCanonicalLegalDocumentKey(documentKey)) {
    return jsonNoStore({ error: 'Unsupported legal document' }, 400)
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return jsonNoStore({ error: 'Invalid rollback request' }, 400)
  }
  const sourceRevisionId = String(body.sourceRevisionId || '')
  const expectedCurrentPublishedRevisionId = String(
    body.expectedCurrentPublishedRevisionId || '',
  )
  if (
    !isUuid(sourceRevisionId) ||
    !isUuid(expectedCurrentPublishedRevisionId)
  ) {
    return jsonNoStore({ error: 'Invalid rollback revision metadata' }, 400)
  }

  try {
    const document = await rollbackAdminLegalRevision({
      documentKey,
      sourceRevisionId,
      expectedCurrentPublishedRevisionId,
      actorCustomerId: admin.customer_id,
    })
    invalidatePublishedLegalContent()
    return jsonNoStore({ document })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to roll back legal revision'
    const status = error instanceof LegalPublishingConflictError
      ? 409
      : error instanceof LegalPublishingValidationError
        ? 400
        : 500
    return jsonNoStore({ error: message }, status)
  }
}
