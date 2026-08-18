import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'
import { resolveCoverAssetFromPreviewJob } from '@/lib/share-preview'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'

function createShareToken() {
  return randomBytes(12).toString('hex')
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const creationId = String(body?.creationId || '').trim()
    const expectedCustomerId = body?.customerId ? String(body.customerId) : null

    if (!creationId) {
      return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
    }

    const owner = await resolveCheckoutOwner(request, {
      expectedCustomerId,
      createAnonIfMissing: true,
    })
    if (!owner) return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 401 })
    const filter = ownerFilter(owner)
    const { data: creation, error: creationError } = await supabaseAdmin
      .from('creations')
      .select('creation_id, owner_type, anon_session_id, customer_id, template_id, preview_job_id')
      .eq('creation_id', creationId)
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)
      .maybeSingle()

    if (creationError || !creation?.creation_id) {
      return NextResponse.json({ error: 'Creation not found' }, { status: 404 })
    }

    if (!creation.preview_job_id) {
      return NextResponse.json({ error: 'Preview is not ready for sharing' }, { status: 409 })
    }

    const coverAsset = await resolveCoverAssetFromPreviewJob(creation.preview_job_id)

    const { data: existing } = await supabaseAdmin
      .from('preview_share_links')
      .select('share_token')
      .eq('creation_id', creationId)
      .maybeSingle()

    let shareToken = existing?.share_token ?? null

    if (!shareToken) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = createShareToken()
        const { data: conflict } = await supabaseAdmin
          .from('preview_share_links')
          .select('preview_share_id')
          .eq('share_token', candidate)
          .maybeSingle()
        if (!conflict) {
          shareToken = candidate
          break
        }
      }
    }

    if (!shareToken) {
      return NextResponse.json({ error: 'Failed to create share token' }, { status: 500 })
    }

    const { error: upsertError } = await supabaseAdmin
      .from('preview_share_links')
      .upsert(
        {
          creation_id: creationId,
          preview_job_id: creation.preview_job_id,
          owner_type: creation.owner_type,
          anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
          customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
          template_id: creation.template_id,
          share_token: shareToken,
          cover_bucket: coverAsset.bucket,
          cover_storage_path: coverAsset.storagePath,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'creation_id' }
      )

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      token: shareToken,
      shareUrl: buildAbsoluteUrl(`/share/preview/${shareToken}`),
      imageUrl: buildAbsoluteUrl(`/share/preview/${shareToken}/image`),
    })
  } catch (error: any) {
    const ownerErrorResponse = checkoutOwnerErrorResponse(error)
    if (ownerErrorResponse) return ownerErrorResponse
    return NextResponse.json(
      { error: error?.message || 'Failed to create preview share link' },
      { status: 500 }
    )
  }
}
