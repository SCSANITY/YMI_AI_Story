import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (relativePath) => readFile(new URL(relativePath, root), 'utf8')

test('Preview purchase treats Creation and Job as one recoverable server-owned identity', async () => {
  const [page, service] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('src/services/purchaseConfiguration.ts'),
  ])

  assert.match(service, /isRecoverablePurchaseIdentityError/)
  assert.match(service, /creation_not_found/)
  assert.match(service, /preview_conflict/)
  assert.match(page, /creationIdRef\.current[\s\S]*locationCreationId[\s\S]*creationIdParam/)
  assert.match(page, /previewJobIdRef\.current[\s\S]*locationPreviewJobId[\s\S]*previewJobIdParam/)
  assert.match(page, /reconcilePurchaseConfigurationIdentity[\s\S]*\/api\/creations\/resolve\?jobId=/)
  assert.match(page, /if \(!isRecoverablePurchaseIdentityError\(error\)[\s\S]*reconcilePurchaseConfigurationIdentity/)
  assert.match(page, /const purchaseConfiguration = await ensureCurrentPurchaseConfiguration\(\)[\s\S]*const ensuredCreationId = purchaseConfiguration\.creationId/g)
  assert.doesNotMatch(page, /const ensuredCreationId =\s*\(creationIdParam[\s\S]{0,700}commitSelectedPreviewForExit/)
})

test('identity recovery is bounded and keeps server ownership checks authoritative', async () => {
  const page = await read('components/PersonalizePage.tsx')
  const saveStart = page.indexOf('const saveEditionConfiguration')
  const saveEnd = page.indexOf('const resolveEditionError', saveStart)
  const implementation = page.slice(saveStart, saveEnd)

  assert.ok(saveStart >= 0)
  assert.ok(saveEnd > saveStart)
  assert.equal((implementation.match(/return persist\(\)/g) ?? []).length, 1)
  assert.match(implementation, /return await persist\(\)/)
  assert.match(implementation, /if \(!reconciled\) throw error/)
  assert.doesNotMatch(implementation, /while\s*\(|setInterval|setTimeout/)
})
