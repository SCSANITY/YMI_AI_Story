import type { PurchasePackageType } from '@/lib/purchase-configuration'

export type PurchaseConfigurationResult = {
  packageType: PurchasePackageType
  priceAtPurchase: number
  packagePriceVersion: number
  voiceAssetId: string | null
  voiceReady: boolean
}

export class PurchaseConfigurationRequestError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'PurchaseConfigurationRequestError'
    this.status = status
    this.code = code
  }
}

export async function savePurchaseConfiguration(args: {
  creationId: string
  expectedPreviewJobId: string
  packageType: PurchasePackageType
  voiceAssetId?: string | null
  clearVoice?: boolean
  customerId?: string | null
  signal?: AbortSignal
}): Promise<PurchaseConfigurationResult> {
  const response = await fetch(
    `/api/creations/${encodeURIComponent(args.creationId)}/purchase-configuration`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      cache: 'no-store',
      signal: args.signal,
      body: JSON.stringify({
        expected_preview_job_id: args.expectedPreviewJobId,
        package_type: args.packageType,
        voice_binding: args.voiceAssetId ? { asset_id: args.voiceAssetId } : null,
        clear_voice: args.clearVoice === true,
        customerId: args.customerId ?? null,
      }),
    }
  )

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) {
    throw new PurchaseConfigurationRequestError(
      String(payload?.error ?? 'Unable to save this edition. Please try again.'),
      response.status,
      String(payload?.code ?? 'purchase_configuration_failed')
    )
  }

  const packageType = String(payload?.packageType ?? '') as PurchasePackageType
  const priceAtPurchase = Number(payload?.priceAtPurchase)
  const packagePriceVersion = Number(payload?.packagePriceVersion)
  if (!packageType || !Number.isFinite(priceAtPurchase) || !Number.isFinite(packagePriceVersion)) {
    throw new PurchaseConfigurationRequestError(
      'The saved edition response was incomplete.',
      500,
      'invalid_purchase_configuration_response'
    )
  }

  return {
    packageType,
    priceAtPurchase,
    packagePriceVersion,
    voiceAssetId: typeof payload?.voiceAssetId === 'string' ? payload.voiceAssetId : null,
    voiceReady: payload?.voiceReady === true,
  }
}
