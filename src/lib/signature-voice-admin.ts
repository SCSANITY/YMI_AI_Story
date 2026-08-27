import {
  SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS,
  type SignatureVoiceSubjectRelationship,
} from '@/lib/signature-voice'
import { normalizeUserAssetContentType, validateUserAssetUpload } from '@/lib/userAssetsStorage'
import { isUuid } from '@/lib/validators'

export const SIGNATURE_VOICE_TRIAGE_STATUSES = ['pending', 'accepted', 'rejected'] as const
export const SIGNATURE_VOICE_NARRATION_MIN_SECONDS = 3
export const SIGNATURE_VOICE_NARRATION_MAX_SECONDS = 600
export const SIGNATURE_VOICE_NARRATION_SLOTS = Array.from(
  { length: 15 },
  (_, index) => `narration_${String(index + 1).padStart(2, '0')}`
) as readonly string[]

export type SignatureVoiceTriageStatus = (typeof SIGNATURE_VOICE_TRIAGE_STATUSES)[number]

export type AdminSignatureVoiceNarrationTrack = {
  assetId: string
  sourceAssetId: string
  contentType: string
  sizeBytes: number
  durationSeconds: number
  revision: number
  verifiedAt: string
  playbackUrl: string
  downloadUrl: string
}

export type AdminSignatureVoiceNarrationSlot = {
  slotKey: string
  position: number
  track: AdminSignatureVoiceNarrationTrack | null
}

export type AdminSignatureVoiceItem = {
  cartItemId: string
  creationId: string
  title: string
  quantity: number
  source: {
    assetId: string
    contentType: string | null
    sizeBytes: number | null
    durationSeconds: number
    createdAt: string | null
    playbackUrl: string
    downloadUrl: string
  }
  declaration: {
    subjectName: string
    subjectRelationship: SignatureVoiceSubjectRelationship
    consentVersion: string
    consentAcceptedAt: string
    boundAt: string
  }
  triage: {
    sourceRevision: number
    technicalStatus: SignatureVoiceTriageStatus
    technicalReason: string | null
    technicalReviewedAt: string | null
    adultDeclarationStatus: SignatureVoiceTriageStatus
    adultDeclarationReason: string | null
    adultDeclarationReviewedAt: string | null
    updatedAt: string | null
  }
  hardware: {
    status: 'pending' | 'attested'
    manifestSha256: string | null
    attestedByCustomerId: string | null
    attestedByName: string | null
    attestedAt: string | null
    shipmentIntegrityCheckedAt: string | null
  }
  narration: AdminSignatureVoiceNarrationSlot[]
}

export type AdminSignatureVoiceWorkspace = {
  order: {
    orderId: string
    displayId: string | null
    orderStatus: string | null
    customerName: string
    email: string | null
  }
  items: AdminSignatureVoiceItem[]
}

export class SignatureVoiceAdminError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignatureVoiceAdminError'
  }
}

function requiredString(value: unknown, field: string, maximum: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maximum) {
    throw new SignatureVoiceAdminError(`${field} is invalid`)
  }
  return text
}

function optionalReason(value: unknown, status: SignatureVoiceTriageStatus, field: string) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > 1000) throw new SignatureVoiceAdminError(`${field} is too long`)
  if (status === 'rejected' && !text) {
    throw new SignatureVoiceAdminError(`${field} is required when rejected`)
  }
  return status === 'rejected' ? text : null
}

function exactObject(value: unknown, keys: string[], label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SignatureVoiceAdminError(`${label} is invalid`)
  }
  const record = value as Record<string, unknown>
  const actual = Object.keys(record).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new SignatureVoiceAdminError(`${label} fields are invalid`)
  }
  return record
}

function requiredUuid(value: unknown, field: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!isUuid(normalized)) throw new SignatureVoiceAdminError(`${field} is invalid`)
  return normalized
}

function optionalUuid(value: unknown, field: string) {
  if (value === null) return null
  return requiredUuid(value, field)
}

export function parseSignatureVoiceNarrationSlot(value: unknown) {
  const slotKey = typeof value === 'string' ? value.trim() : ''
  if (!SIGNATURE_VOICE_NARRATION_SLOTS.includes(slotKey)) {
    throw new SignatureVoiceAdminError('Narration slot is invalid')
  }
  return slotKey
}

function triageStatus(value: unknown, field: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!SIGNATURE_VOICE_TRIAGE_STATUSES.includes(normalized as SignatureVoiceTriageStatus)) {
    throw new SignatureVoiceAdminError(`${field} is invalid`)
  }
  return normalized as SignatureVoiceTriageStatus
}

export function parseSignatureVoiceTriageRequest(value: unknown) {
  const input = exactObject(value, [
    'adultDeclarationReason',
    'adultDeclarationStatus',
    'cartItemId',
    'creationId',
    'expectedUpdatedAt',
    'technicalReason',
    'technicalStatus',
  ], 'Signature Voice triage')
  const technicalStatus = triageStatus(input.technicalStatus, 'Technical status')
  const adultDeclarationStatus = triageStatus(
    input.adultDeclarationStatus,
    'Authorization review status'
  )
  const expectedUpdatedAt = input.expectedUpdatedAt === null
    ? null
    : requiredString(input.expectedUpdatedAt, 'Expected revision', 100)

  return {
    cartItemId: requiredUuid(input.cartItemId, 'Cart item ID'),
    creationId: requiredUuid(input.creationId, 'Creation ID'),
    expectedUpdatedAt,
    technicalStatus,
    technicalReason: optionalReason(input.technicalReason, technicalStatus, 'Technical reason'),
    adultDeclarationStatus,
    adultDeclarationReason: optionalReason(
      input.adultDeclarationReason,
      adultDeclarationStatus,
      'Authorization review reason'
    ),
  }
}

export function parseSignatureVoiceHardwareAttestationRequest(value: unknown) {
  const input = exactObject(value, [
    'accepted',
    'cartItemId',
    'creationId',
    'sourceAssetId',
  ], 'Signature Voice hardware attestation')
  if (input.accepted !== true) {
    throw new SignatureVoiceAdminError('Hardware loading must be explicitly confirmed')
  }
  return {
    accepted: true as const,
    cartItemId: requiredUuid(input.cartItemId, 'Cart item ID'),
    creationId: requiredUuid(input.creationId, 'Creation ID'),
    sourceAssetId: requiredUuid(input.sourceAssetId, 'Source asset ID'),
  }
}

export function parseSignatureVoiceReplacementUploadRequest(value: unknown) {
  const input = exactObject(value, [
    'cartItemId',
    'contentType',
    'expectedAssetId',
    'fileName',
    'sizeBytes',
  ], 'Signature Voice replacement upload')
  const upload = validateUserAssetUpload({
    assetType: 'voice_sample',
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  })
  return {
    cartItemId: requiredUuid(input.cartItemId, 'Cart item ID'),
    expectedAssetId: requiredUuid(input.expectedAssetId, 'Expected asset ID'),
    fileName: requiredString(input.fileName, 'File name', 255),
    ...upload,
  }
}

export function parseSignatureVoiceReplacementConfirmRequest(value: unknown) {
  const input = exactObject(value, [
    'authorizationReference',
    'cartItemId',
    'contentType',
    'expectedAssetId',
    'fileName',
    'newAssetId',
    'reason',
    'sizeBytes',
    'storagePath',
    'subjectName',
    'subjectRelationship',
  ], 'Signature Voice replacement confirmation')
  const upload = validateUserAssetUpload({
    assetType: 'voice_sample',
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  })
  const relationship = requiredString(input.subjectRelationship, 'Subject relationship', 80)
  if (!SIGNATURE_VOICE_SUBJECT_RELATIONSHIPS.includes(
    relationship as SignatureVoiceSubjectRelationship
  )) {
    throw new SignatureVoiceAdminError('Subject relationship is invalid')
  }
  return {
    cartItemId: requiredUuid(input.cartItemId, 'Cart item ID'),
    expectedAssetId: requiredUuid(input.expectedAssetId, 'Expected asset ID'),
    newAssetId: requiredUuid(input.newAssetId, 'New asset ID'),
    storagePath: requiredString(input.storagePath, 'Storage path', 1000),
    fileName: requiredString(input.fileName, 'File name', 255),
    reason: requiredString(input.reason, 'Replacement reason', 1000),
    authorizationReference: requiredString(
      input.authorizationReference,
      'Authorization reference',
      500
    ),
    subjectName: requiredString(input.subjectName, 'Subject name', 120),
    subjectRelationship: relationship as SignatureVoiceSubjectRelationship,
    ...upload,
  }
}

export function parseSignatureVoiceNarrationUploadRequest(value: unknown) {
  const input = exactObject(value, [
    'cartItemId',
    'contentType',
    'expectedTrackAssetId',
    'fileName',
    'sizeBytes',
    'sourceAssetId',
  ], 'Signature Voice narration upload')
  const upload = validateUserAssetUpload({
    assetType: 'voice_sample',
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  })
  return {
    cartItemId: requiredUuid(input.cartItemId, 'Cart item ID'),
    sourceAssetId: requiredUuid(input.sourceAssetId, 'Source asset ID'),
    expectedTrackAssetId: optionalUuid(input.expectedTrackAssetId, 'Expected narration asset ID'),
    fileName: requiredString(input.fileName, 'File name', 255),
    ...upload,
  }
}

export function parseSignatureVoiceNarrationConfirmRequest(value: unknown) {
  const input = exactObject(value, [
    'cartItemId',
    'contentType',
    'expectedTrackAssetId',
    'fileName',
    'newAssetId',
    'sizeBytes',
    'sourceAssetId',
    'storagePath',
  ], 'Signature Voice narration confirmation')
  const upload = validateUserAssetUpload({
    assetType: 'voice_sample',
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
  })
  return {
    cartItemId: requiredUuid(input.cartItemId, 'Cart item ID'),
    sourceAssetId: requiredUuid(input.sourceAssetId, 'Source asset ID'),
    expectedTrackAssetId: optionalUuid(input.expectedTrackAssetId, 'Expected narration asset ID'),
    newAssetId: requiredUuid(input.newAssetId, 'New narration asset ID'),
    storagePath: requiredString(input.storagePath, 'Storage path', 1000),
    fileName: requiredString(input.fileName, 'File name', 255),
    ...upload,
  }
}

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/x-m4a': 'm4a',
}

const EXTENSION_CONTENT_TYPE: Record<string, string> = {
  webm: 'audio/webm',
  m4a: 'audio/x-m4a',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

export function resolveSignatureVoiceFileContentType(input: {
  fileName: string
  contentType: unknown
}) {
  const declared = normalizeUserAssetContentType(input.contentType)
  if (CONTENT_TYPE_EXTENSION[declared]) return declared
  const extension = input.fileName.trim().toLowerCase().split('.').pop() || ''
  return EXTENSION_CONTENT_TYPE[extension] || ''
}

export function buildSignatureVoiceReplacementStoragePath(input: {
  orderId: string
  creationId: string
  assetId: string
  contentType: unknown
}) {
  const contentType = normalizeUserAssetContentType(input.contentType)
  const extension = CONTENT_TYPE_EXTENSION[contentType]
  if (!isUuid(input.orderId) || !isUuid(input.creationId) || !isUuid(input.assetId) || !extension) {
    throw new SignatureVoiceAdminError('Replacement storage identity is invalid')
  }
  return `signature-voice-replacements/${input.orderId}/${input.creationId}/${input.assetId}.${extension}`
}

export function buildSignatureVoiceNarrationStoragePath(input: {
  orderId: string
  creationId: string
  slotKey: string
  assetId: string
  contentType: unknown
}) {
  const contentType = normalizeUserAssetContentType(input.contentType)
  const extension = CONTENT_TYPE_EXTENSION[contentType]
  const slotKey = parseSignatureVoiceNarrationSlot(input.slotKey)
  if (!isUuid(input.orderId) || !isUuid(input.creationId) || !isUuid(input.assetId) || !extension) {
    throw new SignatureVoiceAdminError('Narration storage identity is invalid')
  }
  return `signature-voice-narration/${input.orderId}/${input.creationId}/${slotKey}/${input.assetId}.${extension}`
}

export function isSignatureVoiceNarrationStoragePath(input: {
  storagePath: string
  orderId: string
  creationId: string
  slotKey: string
  assetId: string
  contentType: unknown
}) {
  try {
    return input.storagePath === buildSignatureVoiceNarrationStoragePath(input)
  } catch {
    return false
  }
}

export function isSignatureVoiceReplacementStoragePath(input: {
  storagePath: string
  orderId: string
  creationId: string
  assetId: string
  contentType: unknown
}) {
  try {
    return input.storagePath === buildSignatureVoiceReplacementStoragePath(input)
  } catch {
    return false
  }
}

export function assertSignatureVoiceAudioContainer(contentType: string, container: unknown) {
  const normalizedContainer = String(container ?? '').trim().toLowerCase()
  const allowed: Record<string, string[]> = {
    'audio/webm': ['webm', 'matroska'],
    'audio/mp4': ['mp4', 'm4a', 'quicktime'],
    'audio/x-m4a': ['mp4', 'm4a', 'quicktime'],
    'audio/mpeg': ['mpeg', 'mp3'],
    'audio/wav': ['wave', 'wav'],
    'audio/x-wav': ['wave', 'wav'],
    'audio/ogg': ['ogg'],
  }
  if (!allowed[contentType]?.some((candidate) => normalizedContainer.includes(candidate))) {
    throw new SignatureVoiceAdminError('Recording container does not match its file type')
  }
}
