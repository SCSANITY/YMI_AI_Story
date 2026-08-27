import type { CheckoutOwner } from '@/lib/checkout-owner'
import {
  packagePriceRowToModel,
  packageTypeToProductType,
  resolveBookPackageTypeFromSnapshot,
  type TemplatePackagePriceRow,
} from '@/lib/package-pricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  assertSignatureVoicePurchaseBinding,
  requireSignatureVoiceAssetId,
  SignatureVoiceContractError,
} from '@/lib/signature-voice'

export class PackagePricingStoreError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'PackagePricingStoreError'
    this.status = status
  }
}

function creationBelongsToOwner(
  creation: { owner_type?: unknown; customer_id?: unknown; anon_session_id?: unknown },
  owner: CheckoutOwner
) {
  if (owner.ownerType === 'customer') {
    return creation.owner_type === 'customer' && creation.customer_id === owner.customerId
  }
  return creation.owner_type === 'anon' && creation.anon_session_id === owner.anonSessionId
}

export async function loadAuthoritativeCreationPackagePrice(args: {
  creationId: string
  owner: CheckoutOwner
}) {
  const { data: creation, error: creationError } = await supabaseAdmin
    .from('creations')
    .select(`
      creation_id,
      template_id,
      customize_snapshot,
      owner_type,
      customer_id,
      anon_session_id,
      voice_asset_id,
      voice_sample_duration_seconds,
      voice_consent_version,
      voice_consent_accepted_at,
      voice_bound_at,
      voice_subject_name,
      voice_subject_relationship
    `)
    .eq('creation_id', args.creationId)
    .maybeSingle()

  if (creationError) {
    throw new PackagePricingStoreError('Failed to load creation pricing context')
  }
  if (!creation?.creation_id || !creationBelongsToOwner(creation, args.owner)) {
    throw new PackagePricingStoreError('Creation not found', 404)
  }

  const packageType = resolveBookPackageTypeFromSnapshot(creation.customize_snapshot)
  if (!packageType) {
    throw new PackagePricingStoreError('Creation uses an unsupported book package', 409)
  }

  if (packageType === 'supreme') {
    let voiceAssetId: string
    try {
      voiceAssetId = requireSignatureVoiceAssetId(creation)
    } catch (error) {
      if (error instanceof SignatureVoiceContractError) {
        throw new PackagePricingStoreError(error.message, 409)
      }
      throw error
    }

    const { data: voiceAsset, error: voiceAssetError } = await supabaseAdmin
      .from('user_assets')
      .select('asset_id, asset_type, storage_path')
      .eq('asset_id', voiceAssetId)
      .maybeSingle()

    if (voiceAssetError) {
      throw new PackagePricingStoreError('Failed to validate Signature Voice recording')
    }

    try {
      assertSignatureVoicePurchaseBinding(creation, voiceAsset)
    } catch (error) {
      if (error instanceof SignatureVoiceContractError) {
        throw new PackagePricingStoreError(error.message, 409)
      }
      throw error
    }
  }

  const { data: priceRow, error: priceError } = await supabaseAdmin
    .from('template_package_prices')
    .select('package_type, list_price_usd, sale_price_usd, row_version')
    .eq('template_id', creation.template_id)
    .eq('package_type', packageType)
    .maybeSingle()

  if (priceError) {
    throw new PackagePricingStoreError('Failed to load package price')
  }
  if (!priceRow) {
    throw new PackagePricingStoreError('Package price is not configured', 409)
  }

  let price
  try {
    price = packagePriceRowToModel(priceRow as TemplatePackagePriceRow)
  } catch {
    throw new PackagePricingStoreError('Package price is invalid', 409)
  }

  return {
    creationId: String(creation.creation_id),
    templateId: String(creation.template_id),
    packageType,
    productType: packageTypeToProductType(packageType),
    priceAtPurchase: price.effectivePriceUsd,
    packagePriceVersion: price.version,
  }
}

export function packagePricingStoreErrorResponse(error: unknown) {
  if (error instanceof PackagePricingStoreError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return null
}
