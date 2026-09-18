export const PURCHASE_PACKAGE_TYPES = ['basic', 'supreme'] as const

export type PurchasePackageType = (typeof PURCHASE_PACKAGE_TYPES)[number]

export function isPurchasePackageType(value: unknown): value is PurchasePackageType {
  return PURCHASE_PACKAGE_TYPES.includes(String(value ?? '').trim().toLowerCase() as PurchasePackageType)
}

export function normalizePurchasePackageType(value: unknown): PurchasePackageType | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'classic') return 'basic'
  if (normalized === 'signature voice') return 'supreme'
  return isPurchasePackageType(normalized) ? normalized : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function resolvePurchasePackageFromSnapshot(snapshot: unknown): PurchasePackageType | null {
  const record = asRecord(snapshot)
  const overrides = asRecord(record.textOverrides ?? record.text_overrides)
  return normalizePurchasePackageType(
    overrides.book_type
      ?? overrides.bookType
      ?? record.bookType
      ?? record.book_type
  )
}

export function buildPurchaseConfigurationSnapshot(
  snapshot: unknown,
  packageType: PurchasePackageType
): Record<string, unknown> & {
  bookType: PurchasePackageType
  textOverrides: Record<string, unknown> & { book_type: PurchasePackageType }
} {
  const record = asRecord(snapshot)
  const existingOverrides = asRecord(record.textOverrides ?? record.text_overrides)

  return {
    ...record,
    bookType: packageType,
    textOverrides: {
      ...existingOverrides,
      book_type: packageType,
    },
  }
}

export function hasCompleteSignatureVoiceBinding(value: {
  voice_asset_id?: unknown
  voice_sample_duration_seconds?: unknown
  voice_consent_version?: unknown
  voice_consent_accepted_at?: unknown
  voice_bound_at?: unknown
  voice_subject_name?: unknown
  voice_subject_relationship?: unknown
  voice_capture_authorization_id?: unknown
  voice_speaker_kind?: unknown
}) {
  return Boolean(
    String(value.voice_asset_id ?? '').trim()
      && Number(value.voice_sample_duration_seconds) > 0
      && String(value.voice_consent_version ?? '').trim()
      && String(value.voice_consent_accepted_at ?? '').trim()
      && String(value.voice_bound_at ?? '').trim()
      && String(value.voice_subject_name ?? '').trim()
      && String(value.voice_subject_relationship ?? '').trim()
      && String(value.voice_capture_authorization_id ?? '').trim()
      && String(value.voice_speaker_kind ?? '').trim()
  )
}
