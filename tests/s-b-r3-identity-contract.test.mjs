import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

test('R3 My Books and Reader reads use the shared identity helper without customerId URLs', () => {
  const myBooks = read('app/my-books/page.tsx')
  const reader = read('app/my-books/[creationId]/OwnedBookReader.tsx')
  assert.match(myBooks, /useReadIdentity\(\)/)
  assert.match(myBooks, /withReadIdentity\(readIdentity/)
  assert.doesNotMatch(myBooks, /fetch\([^\n]*customerId/)
  assert.match(reader, /const readIdentity = useReadIdentity\(\)/)
  assert.match(reader, /withReadIdentity\(readIdentity/)
  assert.doesNotMatch(reader, /reader\$\{suffix\}/)
})

test('GlobalContext deduplicates boot cart and favorites reads and waits for auth resolution', () => {
  const source = read('contexts/GlobalContext.tsx')
  assert.match(source, /if \(!readIdentity\) return/)
  assert.match(source, /fetch\('\/api\/cart', withReadIdentity\(readIdentity/)
  assert.match(source, /fetch\('\/api\/favourites', withReadIdentity\(readIdentity/)
  assert.doesNotMatch(source, /fetch\(`\/api\/cart\$\{params\}/)
  assert.doesNotMatch(source, /fetch\(`\/api\/favourites\$\{params\}/)
})

test('My Books and Reader enforce expected-customer reads without changing mutation fences', () => {
  const myBooksRoute = read('app/api/my-books/route.ts')
  const readerRoute = read('app/api/my-books/[creationId]/reader/route.ts')
  assert.match(myBooksRoute, /x-ymi-expect-customer/)
  assert.match(readerRoute, /x-ymi-expect-customer/)
  assert.match(myBooksRoute, /expectedCustomerId:\s*body\?\.customerId/)
})

test('Cookie Consent GET is claims-local while POST remains remote', () => {
  const source = read('app/api/user/cookie-consent/route.ts')
  assert.match(source, /export async function GET\(\)[\s\S]*getAuthenticatedCustomer\('claims'\)/)
  assert.match(source, /export async function POST\([\s\S]*getAuthenticatedCustomer\('remote'\)/)
})
