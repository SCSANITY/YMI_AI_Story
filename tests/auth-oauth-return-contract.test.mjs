import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('customer and Admin login recover from an unfinished OAuth navigation', async () => {
  const [recovery, customerLogin, adminLogin] = await Promise.all([
    read('src/lib/oauth-return-recovery.ts'),
    read('components/LoginModal.tsx'),
    read('components/admin/AdminLoginClient.tsx'),
  ])

  assert.match(recovery, /window\.addEventListener\('pagehide'/)
  assert.match(recovery, /window\.addEventListener\('pageshow'/)
  assert.match(recovery, /document\.addEventListener\('visibilitychange'/)
  assert.match(recovery, /departedWithPendingOAuth/)
  assert.match(customerLogin, /useOAuthReturnRecovery\(oauthInFlightRef, recoverOAuthReturn\)/)
  assert.match(customerLogin, /oauthInFlightRef\.current = null/)
  assert.match(adminLogin, /useOAuthReturnRecovery\(googleOAuthInFlightRef, recoverOAuthReturn\)/)
  assert.match(adminLogin, /googleOAuthInFlightRef\.current = false/)
})

test('OAuth return recovery restores password controls without creating an auth bypass', async () => {
  const [customerLogin, adminLogin] = await Promise.all([
    read('components/LoginModal.tsx'),
    read('components/admin/AdminLoginClient.tsx'),
  ])

  assert.match(customerLogin, /disabled=\{isPending \|\| Boolean\(pendingOAuthProvider\)\}/)
  assert.match(adminLogin, /const isBusy = isPending \|\| isGooglePending/)
  assert.match(customerLogin, /login\(email, password, 'login'\)/)
  assert.match(adminLogin, /loginAction\(formData\)/)
  assert.doesNotMatch(customerLogin, /setUser\(|bypass|skipAuth/i)
  assert.doesNotMatch(adminLogin, /setUser\(|bypass|skipAuth/i)
})
