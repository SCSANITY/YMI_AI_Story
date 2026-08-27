import { NextResponse } from 'next/server'
import { createHmac, randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  buildUserAssetStoragePath,
  type UploadableUserAssetType,
  validateUserAssetUpload,
} from '@/lib/userAssetsStorage'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import { resolveGuestOtpClientIp } from '@/lib/guest-otp'
import {
  parseSignatureVoiceCaptureAuthorization,
  SignatureVoiceContractError,
} from '@/lib/signature-voice'

const ROLE_BY_ASSET_TYPE: Record<UploadableUserAssetType, string> = {
  face_image: 'face',
  voice_sample: 'voice',
  profile_avatar: 'avatar',
}

type SignatureVoiceAuthorizationReservation = {
  out_authorization_id: string
  out_accepted_at: string
}

function rateLimitKey(scope: string, value: string, secret: string) {
  return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex')
}

function getExtension(contentType: string) {
  const extensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/x-m4a': 'm4a',
  }
  return extensions[contentType] || 'bin'
}

export async function POST(request: Request) {
  const body = await request.json()
  const assetType = body?.asset_type || body?.assetType
  const role = body?.role
  const expectedCustomerId = body?.customerId ?? null
  const fileName = body?.file_name || body?.fileName
  const contentType = body?.content_type || body?.contentType || 'application/octet-stream'
  const sizeBytes = body?.size_bytes ?? body?.sizeBytes
  let voiceAuthorization: ReturnType<typeof parseSignatureVoiceCaptureAuthorization> | null = null

  if (!assetType || typeof assetType !== 'string') {
    return NextResponse.json({ error: 'Asset type is required' }, { status: 400 })
  }
  if (assetType !== 'face_image' && assetType !== 'voice_sample' && assetType !== 'profile_avatar') {
    return NextResponse.json({ error: 'Only face_image, voice_sample and profile_avatar uploads are supported' }, { status: 400 })
  }
  if (!fileName || typeof fileName !== 'string') {
    return NextResponse.json({ error: 'file_name is required' }, { status: 400 })
  }
  if (!role || typeof role !== 'string') {
    return NextResponse.json({ error: 'role is required' }, { status: 400 })
  }
  if (ROLE_BY_ASSET_TYPE[assetType] !== role) {
    return NextResponse.json({ error: 'Upload role does not match asset type' }, { status: 400 })
  }
  if (assetType === 'voice_sample') {
    try {
      voiceAuthorization = parseSignatureVoiceCaptureAuthorization(body?.voice_authorization)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Signature Voice authorization is invalid' },
        { status: error instanceof SignatureVoiceContractError ? 400 : 500 }
      )
    }
  }
  let upload
  try {
    upload = validateUserAssetUpload({ assetType, contentType, sizeBytes })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid upload' },
      { status: 400 }
    )
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

  const rateLimitSecret =
    process.env.UPLOAD_RATE_LIMIT_SECRET ||
    process.env.OTP_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!rateLimitSecret) {
    return NextResponse.json({ error: 'Unable to prepare upload' }, { status: 503 })
  }
  const clientIp = resolveGuestOtpClientIp(request.headers)
  const { data: rateLimitData, error: rateLimitError } = await supabaseAdmin.rpc(
    'consume_user_asset_upload_rate_limit',
    {
      p_owner_key: rateLimitKey('owner', `${filter.owner_type}:${filter.value}`, rateLimitSecret),
      p_ip_key: clientIp ? rateLimitKey('ip', clientIp, rateLimitSecret) : null,
    }
  )
  const decision = Array.isArray(rateLimitData) ? rateLimitData[0] : rateLimitData
  if (rateLimitError || !decision || typeof decision.allowed !== 'boolean') {
    console.error('[uploads] rate-limit check failed', rateLimitError)
    return NextResponse.json({ error: 'Unable to prepare upload' }, { status: 503 })
  }
  if (!decision.allowed) {
    const retryAfter = Math.max(1, Number(decision.retry_after_seconds ?? 60))
    return NextResponse.json(
      { error: 'Too many uploads. Please wait before trying again.', retryAfterSeconds: retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const extension = getExtension(upload.contentType)
  const assetId = randomUUID()
  const storagePath = buildUserAssetStoragePath({
    ownerType: filter.owner_type,
    ownerId: filter.value,
    assetType,
    assetId,
    extension,
  })

  let voiceAuthorizationId: string | null = null
  if (voiceAuthorization) {
    const { data: authorizationData, error: authorizationError } = await supabaseAdmin
      .rpc('reserve_signature_voice_capture_authorization', {
        p_owner_type: filter.owner_type,
        p_anon_session_id: owner.ownerType === 'anon' ? owner.anonSessionId : null,
        p_customer_id: owner.ownerType === 'customer' ? owner.customerId : null,
        p_asset_id: assetId,
        p_storage_path: storagePath,
        p_consent_version: voiceAuthorization.version,
        p_speaker_kind: voiceAuthorization.speakerKind,
      })
      .single()

    const authorization = authorizationData as SignatureVoiceAuthorizationReservation | null
    if (authorizationError || !authorization?.out_authorization_id) {
      console.error('[uploads] Signature Voice authorization reservation failed', authorizationError)
      return NextResponse.json({ error: 'Unable to record Signature Voice authorization' }, { status: 503 })
    }
    voiceAuthorizationId = String(authorization.out_authorization_id)
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUploadUrl(storagePath)

  if (signedError || !signed) {
    if (voiceAuthorizationId) {
      await supabaseAdmin
        .from('signature_voice_capture_authorizations')
        .delete()
        .eq('authorization_id', voiceAuthorizationId)
        .is('confirmed_at', null)
    }
    return NextResponse.json({ error: 'Failed to create signed upload URL' }, { status: 500 })
  }

  return NextResponse.json({
    asset_id: assetId,
    storage_path: storagePath,
    bucket: 'raw-private',
    signed_url: signed.signedUrl,
    token: signed.token,
    max_size_bytes: upload.maxBytes,
    voice_authorization_id: voiceAuthorizationId,
  })
}
