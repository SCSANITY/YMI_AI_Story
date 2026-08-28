import { NextResponse } from 'next/server'
import { parseBuffer } from 'music-metadata'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isValidUserAssetStoragePath,
  USER_ASSET_SIGN_TTL_SECONDS,
  validateStoredUserAssetMetadata,
} from '@/lib/userAssetsStorage'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import {
  SIGNATURE_VOICE_MAX_SAMPLE_SECONDS,
  SIGNATURE_VOICE_MIN_SAMPLE_SECONDS,
} from '@/lib/signature-voice'

export const runtime = 'nodejs'

const MAX_FACE_IMAGES = 8

type ConfirmedSignatureVoiceAsset = {
  out_asset_id: string
  out_owner_type: string
  out_anon_session_id: string | null
  out_customer_id: string | null
  out_asset_type: string
  out_storage_path: string
  out_metadata: Record<string, unknown>
  out_created_at: string
}

export async function POST(request: Request) {
  const body = await request.json()
  const assetId = body?.asset_id || body?.assetId
  const storagePath = body?.storage_path || body?.storagePath
  const assetType = body?.asset_type || body?.assetType
  const role = body?.role
  const expectedCustomerId = body?.customerId ?? null
  const originalName = body?.original_name || body?.originalName || null
  const contentType = body?.content_type || body?.contentType || null
  const sizeBytes = body?.size_bytes ?? body?.sizeBytes
  const voiceAuthorizationId = body?.voice_authorization_id || body?.voiceAuthorizationId || null
  const createdFor = assetType === 'profile_avatar' ? 'profile' : 'preview'
  const source = assetType === 'profile_avatar' ? 'profile' : 'upload'

  if (!assetId || typeof assetId !== 'string') {
    return NextResponse.json({ error: 'asset_id is required' }, { status: 400 })
  }
  if (!storagePath || typeof storagePath !== 'string') {
    return NextResponse.json({ error: 'storage_path is required' }, { status: 400 })
  }
  if (!assetType || typeof assetType !== 'string') {
    return NextResponse.json({ error: 'asset_type is required' }, { status: 400 })
  }
  if (assetType !== 'face_image' && assetType !== 'voice_sample' && assetType !== 'profile_avatar') {
    return NextResponse.json({ error: 'Unsupported asset_type' }, { status: 400 })
  }
  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'role is required' }, { status: 400 })
  }
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId,
      createAnonIfMissing: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unable to resolve owner' }, { status: 401 })
  if (assetType === 'profile_avatar' && owner.ownerType !== 'customer') {
    return NextResponse.json({ error: 'profile_avatar uploads require authentication' }, { status: 401 })
  }
  const filter = ownerFilter(owner)
  if (!isValidUserAssetStoragePath(storagePath, assetId, {
    ownerType: filter.owner_type,
    ownerId: filter.value,
    assetType,
  })) {
    return NextResponse.json({ error: 'storage_path does not match the current owner or asset' }, { status: 400 })
  }
  const anonSessionId = owner.ownerType === 'anon' ? owner.anonSessionId : null

  let verifiedUpload: { contentType: string; sizeBytes: number }
  let verifiedVoiceDuration: number | null = null
  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from('raw-private')
      .info(storagePath)
    if (infoError || !info) throw new Error('Uploaded file was not found')
    verifiedUpload = validateStoredUserAssetMetadata(assetType, { contentType, sizeBytes }, info)
    if (assetType === 'voice_sample') {
      const { data: storedVoice, error: downloadError } = await supabaseAdmin.storage
        .from('raw-private')
        .download(storagePath)
      if (downloadError || !storedVoice) throw new Error('Uploaded recording could not be read')
      const bytes = new Uint8Array(await storedVoice.arrayBuffer())
      const audioMetadata = await parseBuffer(bytes, {
        mimeType: verifiedUpload.contentType,
        size: verifiedUpload.sizeBytes,
      })
      const duration = Number(audioMetadata.format.duration)
      if (
        !Number.isFinite(duration)
        || duration < SIGNATURE_VOICE_MIN_SAMPLE_SECONDS
        || duration > SIGNATURE_VOICE_MAX_SAMPLE_SECONDS
      ) {
        throw new Error(
          `Recording must be between ${SIGNATURE_VOICE_MIN_SAMPLE_SECONDS} and ${SIGNATURE_VOICE_MAX_SAMPLE_SECONDS} seconds`
        )
      }
      verifiedVoiceDuration = Math.round(duration * 100) / 100
    }
  } catch (error) {
    await supabaseAdmin.storage.from('raw-private').remove([storagePath]).catch(() => undefined)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Uploaded file failed verification' },
      { status: 409 }
    )
  }

  const verifiedMetadata = {
    role,
    original_name: originalName,
    created_for: createdFor,
    source,
    content_type: verifiedUpload.contentType,
    size_bytes: verifiedUpload.sizeBytes,
    ...(verifiedVoiceDuration !== null
      ? {
          duration_seconds: verifiedVoiceDuration,
        }
      : {}),
  }

  let asset: Record<string, unknown> | null = null
  let assetError: { message?: string } | null = null
  if (assetType === 'voice_sample') {
    if (!voiceAuthorizationId || typeof voiceAuthorizationId !== 'string') {
      await supabaseAdmin.storage.from('raw-private').remove([storagePath]).catch(() => undefined)
      return NextResponse.json({ error: 'Signature Voice authorization is required' }, { status: 400 })
    }
    const confirmation = await supabaseAdmin
      .rpc('confirm_signature_voice_capture', {
        p_authorization_id: voiceAuthorizationId,
        p_asset_id: assetId,
        p_owner_type: filter.owner_type,
        p_anon_session_id: owner.ownerType === 'anon' ? anonSessionId : null,
        p_customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
        p_storage_path: storagePath,
        p_metadata: verifiedMetadata,
      })
      .single()
    assetError = confirmation.error
    const confirmedAsset = confirmation.data as ConfirmedSignatureVoiceAsset | null
    if (confirmedAsset) {
      asset = {
        asset_id: confirmedAsset.out_asset_id,
        owner_type: confirmedAsset.out_owner_type,
        anon_session_id: confirmedAsset.out_anon_session_id,
        customer_id: confirmedAsset.out_customer_id,
        asset_type: confirmedAsset.out_asset_type,
        storage_path: confirmedAsset.out_storage_path,
        metadata: confirmedAsset.out_metadata,
        created_at: confirmedAsset.out_created_at,
      }
    }
  } else {
    const confirmation = await supabaseAdmin
      .from('user_assets')
      .insert({
        asset_id: assetId,
        owner_type: filter.owner_type,
        anon_session_id: owner.ownerType === 'anon' ? anonSessionId : null,
        customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
        asset_type: assetType,
        storage_path: storagePath,
        metadata: verifiedMetadata,
      })
      .select()
      .single()
    asset = confirmation.data
    assetError = confirmation.error
  }

  if (assetError || !asset) {
    return NextResponse.json({ error: 'Failed to record asset' }, { status: 500 })
  }

  if (assetType === 'voice_sample') {
    return NextResponse.json({
      ...asset,
      playback_url: `/api/user-assets/${encodeURIComponent(assetId)}/download`,
    })
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(storagePath, USER_ASSET_SIGN_TTL_SECONDS)

  if (signedError || !signed) {
    return NextResponse.json({ error: 'Failed to sign asset URL' }, { status: 500 })
  }

  if (assetType === 'face_image') {
    const { data: assets } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id, storage_path')
      .eq('owner_type', filter.owner_type)
      .eq(filter.column, filter.value)
      .eq('asset_type', 'face_image')
      .order('created_at', { ascending: true })

    if (assets && assets.length > MAX_FACE_IMAGES) {
      const toRemove = assets.slice(0, assets.length - MAX_FACE_IMAGES).map((row) => row.asset_id)
      if (toRemove.length) {
        await supabaseAdmin.from('user_assets').delete().in('asset_id', toRemove)
        const paths = assets
          .slice(0, assets.length - MAX_FACE_IMAGES)
          .map((row) => row.storage_path)
          .filter((value): value is string => Boolean(value))
        if (paths.length) await supabaseAdmin.storage.from('raw-private').remove(paths)
      }
    }
  }

  return NextResponse.json({ ...asset, signed_url: signed.signedUrl })
}
