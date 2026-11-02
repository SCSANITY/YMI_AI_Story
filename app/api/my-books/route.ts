import { noStoreJson as privateJson } from '@/lib/http-response'
import { NextResponse } from 'next/server'
import { UUID_REGEX } from '@/lib/validators'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withA9Diagnostics } from '@/lib/a9-diagnostics'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'
import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

const MY_BOOKS_COVER_TTL_SECONDS = 60 * 10

type MyBooksPageRow = Record<string, unknown> & {
  creation_id?: string | null
  _cover_bucket?: unknown
  _cover_path?: string | null
}

export async function GET(request: Request) {
  return withA9Diagnostics(() => getMyBooks(request))
}

async function getMyBooks(request: Request) {
  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      optional: true,
      verification: 'claims',
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  const expectsCustomer = request.headers.get('x-ymi-expect-customer') === '1'
  if (expectsCustomer && (!owner || owner.ownerType !== 'customer')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  if (!owner) return privateJson({ items: [] })

  // S-C1: owner rows + template/package pricing + purchase summary + cover
  // path arrive from one read-only RPC; only cover signing stays here.
  const { data: items, error } = await supabaseAdmin.rpc('get_my_books_page', {
    p_owner_type: owner.ownerType,
    p_owner_id: owner.ownerType === 'customer' ? owner.customerId : owner.anonSessionId,
  })
  if (error) {
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
  }

  const rows = (Array.isArray(items) ? items : []) as MyBooksPageRow[]
  const signedCovers = await createSignedStorageUrlMap(
    rows
      .filter((row) => typeof row._cover_path === 'string' && row._cover_path.length > 0)
      .map((row) => ({
        key: String(row.creation_id),
        bucket: typeof row._cover_bucket === 'string' && row._cover_bucket ? row._cover_bucket : 'raw-private',
        path: String(row._cover_path),
        expiresIn: MY_BOOKS_COVER_TTL_SECONDS,
      }))
  )

  const enriched = rows.map((row) => {
    const publicRow = { ...row }
    delete publicRow._cover_bucket
    delete publicRow._cover_path
    return {
      ...publicRow,
      preview_cover_url: signedCovers.get(String(row.creation_id ?? '')) ?? null,
    }
  })

  return privateJson({ items: enriched })
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null)
  const creationId = body?.creationId ?? body?.creation_id
  if (typeof creationId !== 'string' || !UUID_REGEX.test(creationId)) {
    return privateJson({ error: 'Invalid creationId' }, { status: 400 })
  }
  let owner
  try {
    owner = await resolveCheckoutOwner(request, { expectedCustomerId: body?.customerId ?? null })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? privateJson({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return privateJson({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin.rpc('remove_owned_preview_creation', {
    p_creation_id: creationId,
    p_owner_type: owner.ownerType,
    p_owner_id: owner.ownerType === 'customer' ? owner.customerId : owner.anonSessionId,
  })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === 'PT409' ? 409 : 500
    return privateJson({ error: status === 409 ? 'This preview is busy. Please try again later.' : 'Unable to remove this preview.' }, { status })
  }
  const result = data as { ok?: boolean; mode?: string } | null
  if (!result?.ok || !['soft', 'hard'].includes(String(result.mode))) {
    return privateJson({ error: 'Unable to confirm preview removal. Please reload My Books.' }, { status: 503 })
  }
  // Physical cleanup is internal and post-commit. No Storage or cleanup batch is
  // called from this request, and an unknown response is never auto-retried.
  return privateJson({ ok: true, mode: result.mode })
}
