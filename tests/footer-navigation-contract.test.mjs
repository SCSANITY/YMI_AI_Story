import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('Footer My Account links to the account page', async () => {
  const footer = await readFile(path.join(root, 'components/Footer.tsx'), 'utf8')
  const myAccountLink = footer.match(
    /<Link[^>]+href="([^"]+)"[^>]*>\s*\{t\('footer\.myAccount'\)\}\s*<\/Link>/
  )

  assert.ok(myAccountLink, 'Footer My Account link should exist')
  assert.equal(myAccountLink[1], '/account')
})
