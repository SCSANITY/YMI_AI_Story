import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('password reset requests use Supabase recovery with a generic non-enumerating result', async () => {
  const auth = await read('app/actions/auth.ts')

  assert.match(auth, /resetPasswordForEmail\(email,[\s\S]*redirectTo:\s*buildAbsoluteUrl\('\/auth\/recovery\/callback'\)/)
  assert.match(auth, /return \{ message: PASSWORD_RESET_REQUESTED_MESSAGE \}/)
  assert.doesNotMatch(auth, /user not found|account does not exist|email is not registered/i)
  assert.match(auth, /emailKey:\s*'supabase_password_recovery'/)
})

test('recovery callback accepts token-hash recovery and strips credentials before rendering', async () => {
  const callback = await read('app/auth/recovery/callback/route.ts')

  assert.match(callback, /tokenHash && type === 'recovery'/)
  assert.match(callback, /verifyOtp\(\{[\s\S]*token_hash:\s*tokenHash,[\s\S]*type:\s*'recovery'/)
  assert.match(callback, /exchangeCodeForSession\(code\)/)
  assert.match(callback, /new URL\('\/reset-password', requestUrl\)/)
  assert.match(callback, /httpOnly:\s*true/)
  assert.match(callback, /sameSite:\s*'lax'/)
  assert.doesNotMatch(callback, /searchParams\.set\(['"](?:token_hash|code)['"]/)
})

test('password update requires both recovery intent and an authenticated Supabase user', async () => {
  const auth = await read('app/actions/auth.ts')
  const cookieCheck = auth.indexOf("cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== '1'")
  const userCheck = auth.indexOf('await supabase.auth.getUser()', cookieCheck)
  const update = auth.indexOf('await supabase.auth.updateUser({ password })', userCheck)
  const signout = auth.indexOf("await supabase.auth.signOut({ scope: 'global' })", update)

  assert.ok(cookieCheck >= 0)
  assert.ok(userCheck > cookieCheck)
  assert.ok(update > userCheck)
  assert.ok(signout > update)
  assert.match(auth, /cookieStore\.delete\(PASSWORD_RECOVERY_COOKIE\)/)
})

test('customer login exposes recovery without changing the Admin login surface', async () => {
  const modal = await read('components/LoginModal.tsx')
  const context = await read('contexts/GlobalContext.tsx')
  const shell = await read('components/AppShell.tsx')
  const adminLogin = await read('components/admin/AdminLoginClient.tsx')

  assert.match(modal, /mode === 'recovery'/)
  assert.match(modal, /requestPasswordReset\(email\)/)
  assert.match(modal, /login\.forgotPassword/)
  assert.match(context, /suspendAuthSync/)
  assert.match(shell, /suspendAuthSync=\{isPasswordRecoveryRoute\}/)
  assert.doesNotMatch(adminLogin, /requestPasswordReset|forgotPassword|reset-password|auth\/recovery/i)
})

test('reset page is noindex and never receives a recovery credential prop', async () => {
  const page = await read('app/reset-password/page.tsx')
  const form = await read('components/auth/ResetPasswordForm.tsx')

  assert.match(page, /robots:\s*\{ index: false, follow: false \}/)
  assert.match(page, /PASSWORD_RECOVERY_COOKIE/)
  assert.match(page, /supabase\.auth\.getUser\(\)/)
  assert.match(form, /updateRecoveredPassword\(formData\)/)
  assert.doesNotMatch(form, /token_hash|access_token|refresh_token/)
})
