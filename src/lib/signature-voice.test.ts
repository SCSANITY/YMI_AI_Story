import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertSignatureVoicePurchaseBinding,
  isSignatureVoicePackage,
  parseSignatureVoiceCaptureAuthorization,
  parseSignatureVoiceBindingRequest,
  requireSignatureVoiceAssetId,
  SIGNATURE_VOICE_CONSENT_VERSION,
  SignatureVoiceContractError,
} from './signature-voice'

test('recognizes only the Signature Voice package identifier', () => {
  assert.equal(isSignatureVoicePackage('supreme'), true)
  assert.equal(isSignatureVoicePackage(' Signature Voice '), false)
  assert.equal(isSignatureVoicePackage('basic'), false)
  assert.equal(isSignatureVoicePackage(null), false)
})

const bindingRequest = {
  asset_id: '11111111-1111-4111-8111-111111111111',
}

test('accepts only the closed Signature Voice binding request contract', () => {
  assert.deepEqual(parseSignatureVoiceBindingRequest(bindingRequest), {
    assetId: bindingRequest.asset_id,
  })

  assert.throws(
    () => parseSignatureVoiceBindingRequest({ ...bindingRequest, consent: { accepted: true } }),
    /fields are invalid/
  )
  assert.throws(
    () => parseSignatureVoiceBindingRequest({ ...bindingRequest, duration_seconds: 15 }),
    /fields are invalid/
  )
})

test('accepts only server-stampable child or adult capture authorization v2', () => {
  assert.deepEqual(parseSignatureVoiceCaptureAuthorization({
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speaker_kind: 'current_child',
  }), {
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speakerKind: 'current_child',
  })
  assert.deepEqual(parseSignatureVoiceCaptureAuthorization({
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speaker_kind: 'adult',
  }), {
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speakerKind: 'adult',
  })
  assert.throws(() => parseSignatureVoiceCaptureAuthorization({
    accepted: false,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speaker_kind: 'adult',
  }), /missing or unsupported/)
  assert.throws(() => parseSignatureVoiceCaptureAuthorization({
    accepted: true,
    version: 'signature-voice-consent-v1',
    speaker_kind: 'adult',
  }), /missing or unsupported/)
  assert.throws(() => parseSignatureVoiceCaptureAuthorization({
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speaker_kind: 'child_friend',
  }), /narrator/)
  assert.throws(() => parseSignatureVoiceCaptureAuthorization({
    accepted: true,
    version: SIGNATURE_VOICE_CONSENT_VERSION,
    speaker_kind: 'adult',
    subject_name: 'Client supplied name',
  }), /fields are invalid/)
})

const customerCreation = {
  voice_asset_id: 'voice-asset-1',
  voice_sample_duration_seconds: 15,
  voice_consent_version: SIGNATURE_VOICE_CONSENT_VERSION,
  voice_consent_accepted_at: '2026-08-27T08:00:00.000Z',
  voice_bound_at: '2026-08-27T08:00:00.000Z',
  voice_subject_name: 'Adult narrator',
  voice_subject_relationship: 'self',
  owner_type: 'customer',
  customer_id: 'customer-1',
  anon_session_id: null,
}

const customerAsset = {
  asset_id: 'voice-asset-1',
  asset_type: 'voice_sample',
  storage_path: 'user-assets/customer/customer-1/voice_sample/voice-asset-1.webm',
  owner_type: 'customer',
  customer_id: 'customer-1',
  anon_session_id: null,
}

test('accepts a complete same-owner Signature Voice binding', () => {
  assert.deepEqual(assertSignatureVoicePurchaseBinding(customerCreation, customerAsset), {
    voiceAssetId: 'voice-asset-1',
    durationSeconds: 15,
  })
})

test('fails closed when the Creation has no authoritative voice association', () => {
  assert.throws(
    () => requireSignatureVoiceAssetId({ ...customerCreation, voice_asset_id: null }),
    SignatureVoiceContractError
  )
  assert.throws(
    () => assertSignatureVoicePurchaseBinding({ ...customerCreation, voice_asset_id: null }, null),
    /not bound/
  )
})

test('rejects incomplete consent, duration and subject declarations', () => {
  assert.throws(
    () => assertSignatureVoicePurchaseBinding({ ...customerCreation, voice_consent_version: 'content-generation-consent-v1' }, customerAsset),
    /consent/
  )
  assert.throws(
    () => assertSignatureVoicePurchaseBinding({ ...customerCreation, voice_sample_duration_seconds: 0 }, customerAsset),
    /duration/
  )
  assert.throws(
    () => assertSignatureVoicePurchaseBinding({ ...customerCreation, voice_subject_relationship: 'child' }, customerAsset),
    /relationship/
  )
})

test('rejects the wrong asset type and missing storage', () => {
  assert.throws(
    () => assertSignatureVoicePurchaseBinding(customerCreation, { ...customerAsset, asset_type: 'face_image' }),
    /asset type/
  )
  assert.throws(
    () => assertSignatureVoicePurchaseBinding(customerCreation, { ...customerAsset, storage_path: null }),
    /storage/
  )
})

test('preserves a valid binding when purchase recovery changes only the Creation owner', () => {
  const creation = {
    ...customerCreation,
    owner_type: 'anon',
    customer_id: null,
    anon_session_id: 'anon-1',
  }
  const asset = {
    ...customerAsset,
    owner_type: 'anon',
    customer_id: null,
    anon_session_id: 'anon-1',
  }

  const recoveredCreation = {
    ...creation,
    owner_type: 'customer',
    customer_id: 'customer-2',
    anon_session_id: null,
  }

  assert.equal(assertSignatureVoicePurchaseBinding(recoveredCreation, asset).voiceAssetId, 'voice-asset-1')
})
