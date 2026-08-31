import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const verifyRoutePath = new URL('../app/api/guest/verify-otp/route.ts', import.meta.url)
const requestRoutePath = new URL('../app/api/guest/request-otp/route.ts', import.meta.url)
const sqlPath = new URL(
  './fixtures/external-contracts/sql/sql_guest_otp_verification_attempts.sql',
  import.meta.url,
)

test('Guest OTP verification is atomic and bounded to five failed attempts', async () => {
  const [verifyRoute, requestRoute, sql] = await Promise.all([
    readFile(verifyRoutePath, 'utf8'),
    readFile(requestRoutePath, 'utf8'),
    readFile(sqlPath, 'utf8'),
  ])

  assert.match(verifyRoute, /\.rpc\(['"]verify_guest_otp['"]/)
  assert.doesNotMatch(verifyRoute, /\.eq\(['"]code['"]/)
  assert.match(verifyRoute, /verification guard failed[\s\S]*status: 503/)

  assert.match(sql, /select \*[\s\S]*from public\.verification_codes[\s\S]*for update;/i)
  assert.match(sql, /failed_attempts >= 5/)
  assert.match(sql, /v_next_attempts := v_verification\.failed_attempts \+ 1/)
  assert.match(sql, /delete from public\.verification_codes where email = v_verification\.email/)
  assert.match(sql, /revoke all on function public\.verify_guest_otp\(text, text\) from public, anon, authenticated/)

  assert.match(requestRoute, /neq\(['"]verification_id['"], verification\.verification_id\)/)
  assert.doesNotMatch(requestRoute, /neq\(['"]code['"]/)
})
