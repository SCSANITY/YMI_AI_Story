import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  LegalPublishingConflictError,
  LegalPublishingValidationError,
} from '@/lib/legal-publishing'
import {
  isCanonicalLegalDocumentKey,
  loadAdminLegalDocument,
  saveAdminLegalDraft,
} from '@/lib/legal-publishing-store'

type RouteContext = {
  params: Promise<{ documentKey: string }> | { documentKey: string }
}

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  const status = error instanceof LegalPublishingConflictError
    ? 409
    : error instanceof LegalPublishingValidationError
      ? 400
      : 500
  return jsonNoStore({ error: message }, status)
}

function isUuid(value: unknown) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(_request: Request, context: RouteContext) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, 403)

  const { documentKey } = await Promise.resolve(context.params)
  if (!isCanonicalLegalDocumentKey(documentKey)) {
    return jsonNoStore({ error: 'Unsupported legal document' }, 400)
  }

  try {
    const document = await loadAdminLegalDocument(documentKey)
    if (!document) return jsonNoStore({ error: 'Legal document not found' }, 404)
    return jsonNoStore({ document })
  } catch (error) {
    return errorResponse(error, 'Failed to load legal document')
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, 403)

  const { documentKey } = await Promise.resolve(context.params)
  if (!isCanonicalLegalDocumentKey(documentKey)) {
    return jsonNoStore({ error: 'Unsupported legal document' }, 400)
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return jsonNoStore({ error: 'Invalid legal draft request' }, 400)
  }
  const expectedDraftRevisionId =
    typeof body.expectedDraftRevisionId === 'string'
      ? body.expectedDraftRevisionId
      : null
  const expectedDraftVersion =
    Number.isInteger(body.expectedDraftVersion)
      ? Number(body.expectedDraftVersion)
      : null
  const basePublishedRevisionId = String(body.basePublishedRevisionId || '')
  if (
    !isUuid(basePublishedRevisionId) ||
    (expectedDraftRevisionId !== null && !isUuid(expectedDraftRevisionId)) ||
    ((expectedDraftRevisionId === null) !== (expectedDraftVersion === null)) ||
    (expectedDraftVersion !== null && expectedDraftVersion < 1)
  ) {
    return jsonNoStore({ error: 'Invalid legal draft revision metadata' }, 400)
  }

  try {
    const document = await saveAdminLegalDraft({
      documentKey,
      content: body.content,
      expectedDraftRevisionId,
      expectedDraftVersion,
      basePublishedRevisionId,
      actorCustomerId: admin.customer_id,
    })
    return jsonNoStore({ document })
  } catch (error) {
    return errorResponse(error, 'Failed to save legal draft')
  }
}
