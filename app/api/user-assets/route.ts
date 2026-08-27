import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { USER_ASSET_SIGN_TTL_SECONDS } from '@/lib/userAssetsStorage'
import {
  SIGNATURE_VOICE_MAX_SAMPLE_SECONDS,
  SIGNATURE_VOICE_MIN_SAMPLE_SECONDS,
} from '@/lib/signature-voice'

type UserAssetDeletionResult = {
  out_cleanup_id: string | null
  out_storage_path: string | null
}

type UserAssetRow = {
  asset_id: string
  asset_type: string
  storage_path: string | null
  metadata: unknown
  created_at: string
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      optional: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) {
    return NextResponse.json({ faces: [], profiles: [], voices: [] })
  }
  const filter = ownerFilter(owner)

  const { data: assets, error } = await supabaseAdmin
    .from('user_assets')
    .select('asset_id, asset_type, storage_path, metadata, created_at')
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .order('created_at', { ascending: false })

  if (error || !assets) {
    return NextResponse.json({ faces: [], profiles: [], voices: [] })
  }

  const assetRows = assets as UserAssetRow[]
  const faces = assetRows.filter((row) => row.asset_type === 'face_image').slice(0, 8)
  const profiles = assetRows.filter((row) => row.asset_type === 'text_profile').slice(0, 10)
  const voices = assetRows.filter((row) => {
    if (row.asset_type !== 'voice_sample' || !row.storage_path) return false
    if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) return false
    const metadata = row.metadata as Record<string, unknown>
    const duration = Number(metadata.duration_seconds)
    return Number.isFinite(duration)
      && duration >= SIGNATURE_VOICE_MIN_SAMPLE_SECONDS
      && duration <= SIGNATURE_VOICE_MAX_SAMPLE_SECONDS
      && metadata.consent_version === 'signature-voice-consent-v2'
      && (metadata.speaker_kind === 'current_child' || metadata.speaker_kind === 'adult')
  }).slice(0, 5)

  const facesWithUrls = await Promise.all(
    faces.map(async (face) => {
      if (!face.storage_path) return { ...face, signed_url: null }
      const { data: signed } = await supabaseAdmin.storage
        .from('raw-private')
        .createSignedUrl(face.storage_path, USER_ASSET_SIGN_TTL_SECONDS)
      return { ...face, signed_url: signed?.signedUrl ?? null }
    })
  )

  const voicesWithUrls = voices.map((voice) => ({
    ...voice,
    playback_url: voice.storage_path
      ? `/api/user-assets/${encodeURIComponent(voice.asset_id)}/download`
      : null,
  }))

  return NextResponse.json({ faces: facesWithUrls, profiles, voices: voicesWithUrls })
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}))
  const assetId = body?.asset_id || body?.assetId

  if (!assetId) {
    return NextResponse.json({ error: 'Missing asset_id' }, { status: 400 })
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: body?.customerId ?? null,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Missing owner context' }, { status: 401 })
  const filter = ownerFilter(owner)

  const { data: deletionResult, error: deleteError } = await supabaseAdmin
    .rpc('delete_owned_unbound_user_asset', {
      p_asset_id: assetId,
      p_owner_type: filter.owner_type,
      p_anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
      p_customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
    })
    .single()

  if (deleteError) {
    if (deleteError.message?.includes('voice_asset_bound')) {
      return NextResponse.json(
        { error: 'This recording is bound to a personalized book and cannot be deleted' },
        { status: 409 }
      )
    }
    if (deleteError.message?.includes('user_asset_not_found') || deleteError.code === 'P0002') {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }
    if (deleteError.message?.includes('user_asset_owner_mismatch') || deleteError.code === '42501') {
      return NextResponse.json({ error: 'Asset does not belong to the current owner' }, { status: 403 })
    }
    console.error('[user-assets] safe delete failed', deleteError)
    return NextResponse.json({ error: 'Failed to delete asset' }, { status: 500 })
  }

  const deletion = deletionResult as UserAssetDeletionResult | null
  const cleanupId = deletion?.out_cleanup_id ? String(deletion.out_cleanup_id) : null
  const storagePath = deletion?.out_storage_path ? String(deletion.out_storage_path) : null
  let storageCleanupPending = false

  if (cleanupId && storagePath) {
    const { error: storageError } = await supabaseAdmin.storage
      .from('raw-private')
      .remove([storagePath])

    if (storageError) {
      storageCleanupPending = true
      console.warn('[user-assets] private object cleanup queued', {
        assetId,
        cleanupId,
        message: storageError.message,
      })
      await supabaseAdmin.rpc('fail_user_asset_cleanup', {
        p_cleanup_id: cleanupId,
        p_error: storageError.message,
      })
    } else {
      const { error: finishError } = await supabaseAdmin.rpc('finish_user_asset_cleanup', {
        p_cleanup_id: cleanupId,
      })
      if (finishError) {
        storageCleanupPending = true
        console.warn('[user-assets] cleanup acknowledgement remains queued', {
          assetId,
          cleanupId,
          message: finishError.message,
        })
      }
    }
  }

  return NextResponse.json({ ok: true, storageCleanupPending })
}
