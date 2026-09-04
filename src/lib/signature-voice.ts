export const SIGNATURE_VOICE_CONSENT_VERSION = 'signature-voice-consent-v3'

export function isVerifiedSignatureVoiceDuration(value: unknown) {
  const durationSeconds = Number(value)
  return Number.isFinite(durationSeconds) && durationSeconds > 0
}

export function isSignatureVoicePackage(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'supreme'
}

export const SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS = [
  'self',
  'parent_or_guardian',
  'family_member',
  'other_authorized_adult',
  'authorized_submitter',
] as const

export type SignatureVoiceSubjectRelationship =
  (typeof SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS)[number]

export const SIGNATURE_VOICE_SPEAKER_KINDS = ['current_child', 'adult', 'authorized_speaker'] as const
export type SignatureVoiceSpeakerKind = (typeof SIGNATURE_VOICE_SPEAKER_KINDS)[number]

export type SignatureVoiceCaptureAuthorization = {
  accepted: true
  version: typeof SIGNATURE_VOICE_CONSENT_VERSION
  speakerKind: 'authorized_speaker'
}

export type SignatureVoiceBindingRequest = {
  assetId: string
}

type VoiceBindingCreation = {
  voice_asset_id?: unknown
  voice_sample_duration_seconds?: unknown
  voice_consent_version?: unknown
  voice_consent_accepted_at?: unknown
  voice_bound_at?: unknown
  voice_subject_name?: unknown
  voice_subject_relationship?: unknown
}

type VoiceBindingAsset = {
  asset_id?: unknown
  asset_type?: unknown
  storage_path?: unknown
}

export class SignatureVoiceContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureVoiceContractError'
  }
}

function requiredString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function parseSignatureVoiceBindingRequest(value: unknown): SignatureVoiceBindingRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SignatureVoiceContractError('Signature Voice binding is required')
  }
  const binding = value as Record<string, unknown>
  if (!hasExactKeys(binding, ['asset_id'])) {
    throw new SignatureVoiceContractError('Signature Voice binding fields are invalid')
  }

  const assetId = requiredString(binding.asset_id)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    throw new SignatureVoiceContractError('Signature Voice asset ID is invalid')
  }
  return { assetId }
}

export function parseSignatureVoiceCaptureAuthorization(
  value: unknown
): SignatureVoiceCaptureAuthorization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SignatureVoiceContractError('Signature Voice authorization is required')
  }
  const authorization = value as Record<string, unknown>
  if (!hasExactKeys(authorization, ['accepted', 'speaker_kind', 'version'])) {
    throw new SignatureVoiceContractError('Signature Voice authorization fields are invalid')
  }
  if (
    authorization.accepted !== true
    || authorization.version !== SIGNATURE_VOICE_CONSENT_VERSION
  ) {
    throw new SignatureVoiceContractError('Signature Voice authorization is missing or unsupported')
  }
  const speakerKind = requiredString(authorization.speaker_kind)
  if (speakerKind !== 'authorized_speaker') {
    throw new SignatureVoiceContractError('Signature Voice narrator is invalid')
  }
  return {
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speakerKind: 'authorized_speaker',
  }
}

function requiredTimestamp(value: unknown, field: string) {
  const normalized = requiredString(value)
  const timestamp = Date.parse(normalized)
  if (!normalized || !Number.isFinite(timestamp)) {
    throw new SignatureVoiceContractError(`${field} is invalid`)
  }
  return timestamp
}

export function requireSignatureVoiceAssetId(creation: VoiceBindingCreation) {
  const voiceAssetId = requiredString(creation.voice_asset_id)
  if (!voiceAssetId) {
    throw new SignatureVoiceContractError('Signature Voice recording is not bound')
  }
  return voiceAssetId
}

export function assertSignatureVoicePurchaseBinding(
  creation: VoiceBindingCreation,
  asset: VoiceBindingAsset | null | undefined
) {
  const voiceAssetId = requireSignatureVoiceAssetId(creation)
  const durationSeconds = Number(creation.voice_sample_duration_seconds)
  if (!isVerifiedSignatureVoiceDuration(durationSeconds)) {
    throw new SignatureVoiceContractError('Signature Voice recording duration is invalid')
  }

  if (requiredString(creation.voice_consent_version) !== SIGNATURE_VOICE_CONSENT_VERSION) {
    throw new SignatureVoiceContractError('Signature Voice consent is missing or unsupported')
  }

  const acceptedAt = requiredTimestamp(
    creation.voice_consent_accepted_at,
    'Signature Voice consent timestamp'
  )
  const boundAt = requiredTimestamp(creation.voice_bound_at, 'Signature Voice binding timestamp')
  if (boundAt < acceptedAt) {
    throw new SignatureVoiceContractError('Signature Voice binding predates consent')
  }

  const subjectName = requiredString(creation.voice_subject_name)
  if (!subjectName || subjectName.length > 120) {
    throw new SignatureVoiceContractError('Signature Voice subject declaration is invalid')
  }
  if (
    !SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS.includes(
      requiredString(creation.voice_subject_relationship) as (typeof SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS)[number]
    )
  ) {
    throw new SignatureVoiceContractError('Signature Voice subject relationship is invalid')
  }

  if (!asset || requiredString(asset.asset_id) !== voiceAssetId) {
    throw new SignatureVoiceContractError('Signature Voice recording was not found')
  }
  if (requiredString(asset.asset_type) !== 'voice_sample') {
    throw new SignatureVoiceContractError('Signature Voice asset type is invalid')
  }
  if (!requiredString(asset.storage_path)) {
    throw new SignatureVoiceContractError('Signature Voice recording storage is missing')
  }

  return { voiceAssetId, durationSeconds }
}
