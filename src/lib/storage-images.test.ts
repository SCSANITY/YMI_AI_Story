import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPublicSupabaseStorageImage,
  isSupabaseStorageImage,
  shouldBypassNextImageOptimization,
} from './storage-images'

test('public Supabase images use responsive Next Image delivery', () => {
  const src = 'https://example.supabase.co/storage/v1/object/public/app-templates/Explorer/cover.webp'

  assert.equal(isSupabaseStorageImage(src), true)
  assert.equal(isPublicSupabaseStorageImage(src), true)
  assert.equal(shouldBypassNextImageOptimization(src), false)
})

test('signed and authenticated Supabase images bypass the shared optimizer cache', () => {
  const signed = 'https://example.supabase.co/storage/v1/object/sign/user-assets/cover.webp?token=secret'
  const authenticated = 'https://example.supabase.co/storage/v1/object/authenticated/user-assets/cover.webp'

  assert.equal(shouldBypassNextImageOptimization(signed), true)
  assert.equal(shouldBypassNextImageOptimization(authenticated), true)
})

test('ordinary local images keep the Next Image default', () => {
  assert.equal(isSupabaseStorageImage('/logo.webp'), false)
  assert.equal(shouldBypassNextImageOptimization('/logo.webp'), false)
})
