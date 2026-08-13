import type { CheckoutOwner } from '@/lib/checkout-owner'
import {
  packagePriceRowToModel,
  packageTypeToProductType,
  resolveBookPackageTypeFromSnapshot,
  type TemplatePackagePriceRow,
} from '@/lib/package-pricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

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
    .select('creation_id, template_id, customize_snapshot, owner_type, customer_id, anon_session_id')
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
