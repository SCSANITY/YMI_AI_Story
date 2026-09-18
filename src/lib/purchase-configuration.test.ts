import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPurchaseConfigurationSnapshot,
  hasCompleteSignatureVoiceBinding,
  normalizePurchasePackageType,
  resolvePurchasePackageFromSnapshot,
} from './purchase-configuration'

test('normalizes only physical editions and rejects retired products and aliases', () => {
  assert.equal(normalizePurchasePackageType('digital'), null)
  assert.equal(normalizePurchasePackageType('ebook'), null)
  assert.equal(normalizePurchasePackageType('Cloud Explorer'), null)
  assert.equal(normalizePurchasePackageType('classic'), 'basic')
  assert.equal(normalizePurchasePackageType('Signature Voice'), 'supreme')
  assert.equal(normalizePurchasePackageType('premium'), null)
})

test('updates the package snapshot without discarding existing personalization', () => {
  const current = {
    childName: 'Ari',
    textOverrides: { child_name: 'Ari', language: 'English', book_type: 'basic' },
  }
  const next = buildPurchaseConfigurationSnapshot(current, 'supreme')

  assert.equal(next.childName, 'Ari')
  assert.deepEqual(next.textOverrides, {
    child_name: 'Ari',
    language: 'English',
    book_type: 'supreme',
  })
  assert.equal(next.bookType, 'supreme')
  assert.equal(resolvePurchasePackageFromSnapshot(next), 'supreme')
})

test('requires every server-owned field before treating Signature Voice as ready', () => {
  const complete = {
    voice_asset_id: 'asset-id',
    voice_sample_duration_seconds: 12,
    voice_consent_version: 'signature-voice-consent-v3',
    voice_consent_accepted_at: '2026-09-15T00:00:00.000Z',
    voice_bound_at: '2026-09-15T00:00:00.000Z',
    voice_subject_name: 'Authorized narrator',
    voice_subject_relationship: 'authorized_submitter',
    voice_capture_authorization_id: 'authorization-id',
    voice_speaker_kind: 'authorized_speaker',
  }

  assert.equal(hasCompleteSignatureVoiceBinding(complete), true)
  assert.equal(hasCompleteSignatureVoiceBinding({ ...complete, voice_bound_at: null }), false)
})
