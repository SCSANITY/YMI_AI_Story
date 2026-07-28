import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  LegalPublishingConflictError,
  LegalPublishingValidationError,
} from '@/lib/legal-publishing'
import {
  isCanonicalLegalDocumentKey,
  publishAdminLegalDraft,
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
    return jsonNoStore({ error: 'Invalid publish request' }, 400)
  }
  const draftRevisionId = String(body.draftRevisionId || '')
  const expectedDraftVersion = Number(body.expectedDraftVersion)
  const basePublishedRevisionId = String(body.basePublishedRevisionId || '')
  if (
    !isUuid(draftRevisionId) ||
    !Number.isInteger(expectedDraftVersion) ||
    expectedDraftVersion < 1 ||
    !isUuid(basePublishedRevisionId)
  ) {
    return jsonNoStore({ error: 'Invalid publish revision metadata' }, 400)
  }

  try {
    const document = await publishAdminLegalDraft({
      documentKey,
      draftRevisionId,
      expectedDraftVersion,
      basePublishedRevisionId,
      actorCustomerId: admin.customer_id,
    })
    invalidatePublishedLegalContent()
    return jsonNoStore({ document })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish legal draft'
    const status = error instanceof LegalPublishingConflictError
      ? 409
      : error instanceof LegalPublishingValidationError
        ? 400
        : 500
    return jsonNoStore({ error: message }, status)
  }
}
