import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import {
  SIGNATURE_VOICE_NARRATION_SLOTS,
  type AdminSignatureVoiceItem,
  type AdminSignatureVoiceWorkspace,
  type SignatureVoiceTriageStatus,
} from '@/lib/signature-voice-admin'
import {
  SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS,
  type SignatureVoiceSubjectRelationship,
} from '@/lib/signature-voice'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeUserAssetContentType } from '@/lib/userAssetsStorage'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as UnknownRecord
}

function firstRelation(value: unknown) {
  return asRecord(Array.isArray(value) ? value[0] : value)
}

function nullableString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

function positiveInteger(value: unknown, fallback = 1) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

function triageStatus(value: unknown): SignatureVoiceTriageStatus {
  return value === 'accepted' || value === 'rejected' ? value : 'pending'
}

function subjectRelationship(value: unknown): SignatureVoiceSubjectRelationship {
  const normalized = String(value ?? '') as SignatureVoiceSubjectRelationship
  return SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS.includes(normalized)
    ? normalized
    : 'other_authorized_adult'
}

function metadataNumber(metadata: UnknownRecord, key: string) {
  const number = Number(metadata[key])
  return Number.isFinite(number) && number >= 0 ? number : null
}

export async function loadAdminSignatureVoiceWorkspace(
  orderId: string
): Promise<AdminSignatureVoiceWorkspace | null> {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, customer_id, email')
    .eq('order_id', orderId)
    .maybeSingle()
  if (orderError) throw new Error(orderError.message)
  if (!order) return null
  if (!order.payment_id) throw new Error('Signature Voice production requires a paid order')

  const { data: cartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select(`
      cart_item_id,
      creation_id,
      quantity,
      creations:creations(
        creation_id,
        template_id,
        customize_snapshot,
        voice_asset_id,
        voice_sample_duration_seconds,
        voice_consent_version,
        voice_consent_accepted_at,
        voice_bound_at,
        voice_subject_name,
        voice_subject_relationship,
        templates:templates(name)
      )
    `)
    .eq('order_id', orderId)
    .eq('status', 'ordered')
    .eq('package_type', 'supreme')
  if (cartItemsError) throw new Error(cartItemsError.message)

  const signatureItems = cartItems ?? []
  const normalizedItems = signatureItems
    .map((item) => ({ item, creation: firstRelation(item.creations) }))
    .filter(({ creation }) => nullableString(creation.creation_id) && nullableString(creation.voice_asset_id))
  if (normalizedItems.length !== signatureItems.length) {
    throw new Error('A paid Signature Voice item is missing its authoritative source binding')
  }
  const creationIds = normalizedItems.map(({ creation }) => String(creation.creation_id))
  const assetIds = normalizedItems.map(({ creation }) => String(creation.voice_asset_id))

  const [assetsResult, statesResult, tracksResult, attestationsResult, customerResult] = await Promise.all([
    assetIds.length > 0
      ? supabaseAdmin
          .from('user_assets')
          .select('asset_id, asset_type, metadata, created_at')
          .in('asset_id', assetIds)
      : Promise.resolve({ data: [], error: null }),
    creationIds.length > 0
      ? supabaseAdmin
          .from('signature_voice_production_states')
          .select('*')
          .in('creation_id', creationIds)
      : Promise.resolve({ data: [], error: null }),
    creationIds.length > 0
      ? supabaseAdmin
          .from('signature_voice_narration_tracks')
          .select('creation_id, slot_key, asset_id, source_asset_id, content_type, size_bytes, duration_seconds, revision, verified_at')
          .in('creation_id', creationIds)
      : Promise.resolve({ data: [], error: null }),
    creationIds.length > 0
      ? supabaseAdmin
          .from('signature_voice_hardware_attestations')
          .select('creation_id, source_asset_id, narration_manifest_sha256, attested_by, attested_at, shipment_integrity_checked_at')
          .in('creation_id', creationIds)
      : Promise.resolve({ data: [], error: null }),
    order.customer_id
      ? supabaseAdmin
          .from('customers')
          .select('display_name, email')
          .eq('customer_id', order.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (assetsResult.error) throw new Error(assetsResult.error.message)
  if (statesResult.error) throw new Error(statesResult.error.message)
  if (tracksResult.error) throw new Error(tracksResult.error.message)
  if (attestationsResult.error) throw new Error(attestationsResult.error.message)
  if (customerResult.error) throw new Error(customerResult.error.message)

  const attestingAdminIds = [...new Set(
    (attestationsResult.data ?? [])
      .map((row) => nullableString(row.attested_by))
      .filter((value): value is string => Boolean(value))
  )]
  const { data: attestingAdmins, error: attestingAdminsError } = attestingAdminIds.length > 0
    ? await supabaseAdmin
        .from('customers')
        .select('customer_id, display_name, email')
        .in('customer_id', attestingAdminIds)
    : { data: [], error: null }
  if (attestingAdminsError) throw new Error(attestingAdminsError.message)

  const assetsById = new Map(
    (assetsResult.data ?? []).map((asset) => [String(asset.asset_id), asset])
  )
  const statesByCreationId = new Map(
    (statesResult.data ?? []).map((state) => [String(state.creation_id), state])
  )
  const attestationsByCreationId = new Map(
    (attestationsResult.data ?? []).map((attestation) => [
      String(attestation.creation_id),
      attestation,
    ])
  )
  const attestingAdminsById = new Map(
    (attestingAdmins ?? []).map((admin) => [String(admin.customer_id), admin])
  )
  const tracksByCreationId = new Map<string, Map<string, UnknownRecord>>()
  for (const track of tracksResult.data ?? []) {
    const creationId = String(track.creation_id)
    const slotKey = String(track.slot_key)
    const existing = tracksByCreationId.get(creationId) ?? new Map()
    existing.set(slotKey, track)
    tracksByCreationId.set(creationId, existing)
  }

  const items: AdminSignatureVoiceItem[] = normalizedItems.map(({ item, creation }) => {
    const creationId = String(creation.creation_id)
    const cartItemId = String(item.cart_item_id)
    const assetId = String(creation.voice_asset_id)
    const asset = assetsById.get(assetId)
    if (!asset || String(asset.asset_type) !== 'voice_sample') {
      throw new Error(`Signature Voice source is missing for creation ${creationId}`)
    }
    const metadata = asRecord(asset.metadata)
    const state = statesByCreationId.get(creationId)
    const attestation = attestationsByCreationId.get(creationId)
    const currentAttestation = attestation && String(attestation.source_asset_id) === assetId
      ? attestation
      : null
    const attestedByCustomerId = nullableString(currentAttestation?.attested_by)
    const attestingAdmin = attestedByCustomerId
      ? attestingAdminsById.get(attestedByCustomerId)
      : null
    const template = firstRelation(creation.templates)
    const durationSeconds = Number(creation.voice_sample_duration_seconds)
    if (!Number.isFinite(durationSeconds)) {
      throw new Error(`Signature Voice duration is missing for creation ${creationId}`)
    }
    const encodedOrderId = encodeURIComponent(orderId)
    const encodedCreationId = encodeURIComponent(creationId)
    const encodedCartItemId = encodeURIComponent(cartItemId)
    const encodedAssetId = encodeURIComponent(assetId)
    const sourceBase = `/api/admin/orders/${encodedOrderId}/signature-voice/${encodedCreationId}/source?cartItemId=${encodedCartItemId}&assetId=${encodedAssetId}`
    const narrationTracks = tracksByCreationId.get(creationId) ?? new Map()

    return {
      cartItemId,
      creationId,
      title: resolvePersonalizedBookTitle({
        templateId: creation.template_id,
        templateName: template.name,
        customizeSnapshot: creation.customize_snapshot,
      }),
      quantity: positiveInteger(item.quantity),
      source: {
        assetId,
        contentType: normalizeUserAssetContentType(metadata.content_type) || null,
        sizeBytes: metadataNumber(metadata, 'size_bytes'),
        durationSeconds,
        createdAt: nullableString(asset.created_at),
        playbackUrl: `${sourceBase}&mode=playback`,
        downloadUrl: `${sourceBase}&mode=download`,
      },
      declaration: {
        subjectName: String(creation.voice_subject_name ?? ''),
        subjectRelationship: subjectRelationship(creation.voice_subject_relationship),
        consentVersion: String(creation.voice_consent_version ?? ''),
        consentAcceptedAt: String(creation.voice_consent_accepted_at ?? ''),
        boundAt: String(creation.voice_bound_at ?? ''),
      },
      triage: {
        sourceRevision: positiveInteger(state?.source_revision),
        technicalStatus: triageStatus(state?.technical_status),
        technicalReason: nullableString(state?.technical_reason),
        technicalReviewedAt: nullableString(state?.technical_reviewed_at),
        adultDeclarationStatus: triageStatus(state?.adult_declaration_status),
        adultDeclarationReason: nullableString(state?.adult_declaration_reason),
        adultDeclarationReviewedAt: nullableString(state?.adult_declaration_reviewed_at),
        updatedAt: nullableString(state?.updated_at),
      },
      hardware: {
        status: currentAttestation ? 'attested' : 'pending',
        manifestSha256: nullableString(currentAttestation?.narration_manifest_sha256),
        attestedByCustomerId,
        attestedByName: nullableString(attestingAdmin?.display_name)
          || nullableString(attestingAdmin?.email)
          || attestedByCustomerId,
        attestedAt: nullableString(currentAttestation?.attested_at),
        shipmentIntegrityCheckedAt: nullableString(
          currentAttestation?.shipment_integrity_checked_at
        ),
      },
      narration: SIGNATURE_VOICE_NARRATION_SLOTS.map((slotKey, index) => {
        const track = narrationTracks.get(slotKey)
        if (!track) return { slotKey, position: index + 1, track: null }
        if (String(track.source_asset_id) !== assetId) {
          throw new Error(`Narration ${slotKey} belongs to an outdated source recording`)
        }
        const trackAssetId = String(track.asset_id)
        const trackBase = `/api/admin/orders/${encodedOrderId}/signature-voice/${encodedCreationId}/narration/${encodeURIComponent(slotKey)}/source?cartItemId=${encodedCartItemId}&sourceAssetId=${encodedAssetId}&trackAssetId=${encodeURIComponent(trackAssetId)}`
        return {
          slotKey,
          position: index + 1,
          track: {
            assetId: trackAssetId,
            sourceAssetId: assetId,
            contentType: normalizeUserAssetContentType(track.content_type),
            sizeBytes: Number(track.size_bytes),
            durationSeconds: Number(track.duration_seconds),
            revision: positiveInteger(track.revision),
            verifiedAt: String(track.verified_at),
            playbackUrl: `${trackBase}&mode=playback`,
            downloadUrl: `${trackBase}&mode=download`,
          },
        }
      }),
    }
  })

  const customer = customerResult.data
  return {
    order: {
      orderId: String(order.order_id),
      displayId: nullableString(order.display_id),
      orderStatus: nullableString(order.order_status),
      customerName: nullableString(customer?.display_name) || 'Guest customer',
      email: nullableString(order.email) || nullableString(customer?.email),
    },
    items,
  }
}

export async function requireAdminSignatureVoiceOrderItem(input: {
  orderId: string
  cartItemId: string
  creationId: string
  expectedAssetId: string
}) {
  const { data, error } = await supabaseAdmin
    .from('cart_items')
    .select(`
      cart_item_id,
      creation_id,
      package_type,
      status,
      orders!inner(order_id, payment_id),
      creations!inner(creation_id, voice_asset_id)
    `)
    .eq('cart_item_id', input.cartItemId)
    .eq('order_id', input.orderId)
    .eq('creation_id', input.creationId)
    .eq('package_type', 'supreme')
    .eq('status', 'ordered')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Signature Voice order item was not found')
  const order = firstRelation(data.orders)
  const creation = firstRelation(data.creations)
  if (!order.payment_id || String(creation.voice_asset_id ?? '') !== input.expectedAssetId) {
    throw new Error('Signature Voice source has changed or the order is unpaid')
  }
  return data
}

export function firstRpcRow<T>(data: unknown): T | null {
  return ((Array.isArray(data) ? data[0] : data) as T | null) ?? null
}
