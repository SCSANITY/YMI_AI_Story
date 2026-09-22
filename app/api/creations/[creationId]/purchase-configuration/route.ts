import { NextResponse } from 'next/server'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
} from '@/lib/checkout-owner'
import {
  buildPurchaseConfigurationSnapshot,
  hasCompleteSignatureVoiceBinding,
  normalizePurchasePackageType,
  resolvePurchasePackageFromSnapshot,
} from '@/lib/purchase-configuration'
import { packagePriceRowToModel, type TemplatePackagePriceRow } from '@/lib/package-pricing'
import { loadCreationPhotoLockState } from '@/lib/purchase-state'
import {
  isVerifiedSignatureVoiceDuration,
  parseSignatureVoiceBindingRequest,
  SIGNATURE_VOICE_CONSENT_VERSION,
  SignatureVoiceContractError,
} from '@/lib/signature-voice'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

const EMPTY_VOICE_BINDING = {
  voice_asset_id: null,
  voice_sample_duration_seconds: null,
  voice_consent_version: null,
  voice_consent_accepted_at: null,
  voice_bound_at: null,
  voice_subject_name: null,
  voice_subject_relationship: null,
  voice_capture_authorization_id: null,
  voice_speaker_kind: null,
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ creationId: string }> }
) {
  const { creationId } = await Promise.resolve(context.params)
  if (!isUuid(creationId)) {
    return NextResponse.json(
      { error: 'Invalid creationId', code: 'invalid_creation_id' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  let body: Record<string, unknown>
  try {
    body = asRecord(await request.json())
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body', code: 'invalid_json' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const packageType = normalizePurchasePackageType(body.package_type ?? body.packageType)
  const expectedPreviewJobId = String(
    body.expected_preview_job_id ?? body.expectedPreviewJobId ?? ''
  ).trim()
  if (!packageType || !isUuid(expectedPreviewJobId)) {
    return NextResponse.json(
      { error: 'A valid edition and Preview are required', code: 'invalid_purchase_configuration' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: typeof body.customerId === 'string' ? body.customerId : null,
      allowAnon: true,
      createAnonIfMissing: false,
    })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) {
      response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control'])
      return response
    }
    throw error
  }
  if (!owner) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const filter = ownerFilter(owner)
  const { data: creation, error: creationError } = await supabaseAdmin
    .from('creations')
    .select(`
      creation_id,
      template_id,
      preview_job_id,
      customize_snapshot,
      voice_asset_id,
      voice_sample_duration_seconds,
      voice_consent_version,
      voice_consent_accepted_at,
      voice_bound_at,
      voice_subject_name,
      voice_subject_relationship,
      voice_capture_authorization_id,
      voice_speaker_kind
    `)
    .eq('creation_id', creationId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .maybeSingle()

  if (creationError) {
    return NextResponse.json(
      { error: 'Unable to load this book', code: 'creation_lookup_failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
  if (!creation?.creation_id) {
    return NextResponse.json(
      { error: 'Creation not found', code: 'creation_not_found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }
  if (String(creation.preview_job_id ?? '') !== expectedPreviewJobId) {
    return NextResponse.json(
      { error: 'The active Preview changed in another session', code: 'preview_conflict' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  const [lockStateResult, priceRowResult] = await Promise.allSettled([
    loadCreationPhotoLockState(creationId),
    supabaseAdmin
      .from('template_package_prices')
      .select('package_type, list_price_usd, sale_price_usd, row_version')
      .eq('template_id', creation.template_id)
      .eq('package_type', packageType)
      .maybeSingle(),
  ])

  if (lockStateResult.status === 'rejected') {
    return NextResponse.json(
      { error: 'Unable to verify purchase state', code: 'purchase_state_lookup_failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
  const lockState = lockStateResult.value

  if (priceRowResult.status === 'rejected') {
    return NextResponse.json(
      { error: 'The selected edition price is unavailable', code: 'package_price_unavailable' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }
  const { data: priceRow, error: priceError } = priceRowResult.value
  if (priceError || !priceRow) {
    return NextResponse.json(
      { error: 'The selected edition price is unavailable', code: 'package_price_unavailable' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  const currentPackageType = resolvePurchasePackageFromSnapshot(creation.customize_snapshot)
  const isPurchaseLocked = lockState.purchaseState !== 'unpurchased' || lockState.hasCartAttachment
  const requestedVoiceAssetId = String(asRecord(body.voice_binding).asset_id ?? '').trim()
  if (
    isPurchaseLocked
    && currentPackageType !== packageType
  ) {
    return NextResponse.json(
      { error: 'This edition is already locked for purchase', code: 'purchase_configuration_locked' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }
  if (
    isPurchaseLocked
    && (
      body.clear_voice === true
      || (requestedVoiceAssetId && requestedVoiceAssetId !== String(creation.voice_asset_id ?? ''))
    )
  ) {
    return NextResponse.json(
      { error: 'This voice selection is already locked for purchase', code: 'voice_configuration_locked' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  let voiceBinding = packageType === 'supreme'
    ? {
        voice_asset_id: creation.voice_asset_id,
        voice_sample_duration_seconds: creation.voice_sample_duration_seconds,
        voice_consent_version: creation.voice_consent_version,
        voice_consent_accepted_at: creation.voice_consent_accepted_at,
        voice_bound_at: creation.voice_bound_at,
        voice_subject_name: creation.voice_subject_name,
        voice_subject_relationship: creation.voice_subject_relationship,
        voice_capture_authorization_id: creation.voice_capture_authorization_id,
        voice_speaker_kind: creation.voice_speaker_kind,
      }
    : EMPTY_VOICE_BINDING

  if (packageType === 'supreme' && body.clear_voice === true) {
    voiceBinding = EMPTY_VOICE_BINDING
  } else if (packageType === 'supreme' && body.voice_binding) {
    try {
      const requestedBinding = parseSignatureVoiceBindingRequest(body.voice_binding)
      const { data: voiceAsset, error: voiceAssetError } = await supabaseAdmin
        .from('user_assets')
        .select('asset_id, asset_type, storage_path, metadata')
        .eq('asset_id', requestedBinding.assetId)
        .eq('owner_type', filter.owner_type)
        .eq(filter.column, filter.value)
        .maybeSingle()

      const durationSeconds = Number(voiceAsset?.metadata?.duration_seconds)
      if (
        voiceAssetError
        || !voiceAsset?.asset_id
        || voiceAsset.asset_type !== 'voice_sample'
        || !String(voiceAsset.storage_path ?? '').trim()
        || !isVerifiedSignatureVoiceDuration(durationSeconds)
      ) {
        throw new SignatureVoiceContractError('Signature Voice recording is invalid')
      }

      const { data: authorization, error: authorizationError } = await supabaseAdmin
        .from('signature_voice_capture_authorizations')
        .select('authorization_id, consent_version, speaker_kind, accepted_at, confirmed_at')
        .eq('confirmed_asset_id', requestedBinding.assetId)
        .eq('owner_type', filter.owner_type)
        .eq(filter.column, filter.value)
        .eq('consent_version', SIGNATURE_VOICE_CONSENT_VERSION)
        .eq('speaker_kind', 'authorized_speaker')
        .not('confirmed_at', 'is', null)
        .maybeSingle()

      if (authorizationError || !authorization?.authorization_id || !authorization.accepted_at) {
        throw new SignatureVoiceContractError('Signature Voice authorization is invalid')
      }

      voiceBinding = {
        voice_asset_id: requestedBinding.assetId,
        voice_sample_duration_seconds: durationSeconds,
        voice_consent_version: SIGNATURE_VOICE_CONSENT_VERSION,
        voice_consent_accepted_at: authorization.accepted_at,
        voice_bound_at: authorization.accepted_at,
        voice_subject_name: 'Authorized narrator',
        voice_subject_relationship: 'authorized_submitter',
        voice_capture_authorization_id: authorization.authorization_id,
        voice_speaker_kind: 'authorized_speaker',
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Signature Voice binding is invalid',
          code: 'signature_voice_binding_invalid',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      )
    }
  }

  let price
  try {
    price = packagePriceRowToModel(priceRow as TemplatePackagePriceRow)
  } catch {
    return NextResponse.json(
      { error: 'The selected edition price is invalid', code: 'package_price_invalid' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  const nextSnapshot = buildPurchaseConfigurationSnapshot(
    creation.customize_snapshot,
    packageType
  )
  const { data: updatedCreation, error: updateError } = await supabaseAdmin
    .from('creations')
    .update({
      customize_snapshot: nextSnapshot,
      ...voiceBinding,
    })
    .eq('creation_id', creationId)
    .eq('owner_type', filter.owner_type)
    .eq(filter.column, filter.value)
    .eq('preview_job_id', expectedPreviewJobId)
    .select(`
      creation_id,
      voice_asset_id,
      voice_sample_duration_seconds,
      voice_consent_version,
      voice_consent_accepted_at,
      voice_bound_at,
      voice_subject_name,
      voice_subject_relationship,
      voice_capture_authorization_id,
      voice_speaker_kind
    `)
    .maybeSingle()

  if (updateError || !updatedCreation?.creation_id) {
    return NextResponse.json(
      { error: 'Unable to save this edition', code: 'purchase_configuration_update_failed' },
      { status: updateError ? 500 : 409, headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      packageType,
      priceAtPurchase: price.effectivePriceUsd,
      packagePriceVersion: price.version,
      voiceAssetId: updatedCreation.voice_asset_id ?? null,
      voiceReady: packageType === 'supreme'
        ? hasCompleteSignatureVoiceBinding(updatedCreation)
        : false,
    },
    { headers: NO_STORE_HEADERS }
  )
}
