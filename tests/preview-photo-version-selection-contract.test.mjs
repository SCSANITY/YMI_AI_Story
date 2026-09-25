import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const personalize = fs.readFileSync(path.join(root, 'components/PersonalizePage.tsx'), 'utf8')
const controller = fs.readFileSync(
  path.join(root, 'components/personalize/usePreviewController.ts'),
  'utf8'
)

test('Change Photo switches to a new durable Creation and Job before image waiting', () => {
  const createIndex = personalize.indexOf('const created = await createPreviewVersion({')
  const creationIndex = personalize.indexOf('setCreationId(created.creationId)', createIndex)
  const jobIndex = personalize.indexOf('setPreviewJobId(created.jobId)', createIndex)
  const watchIndex = personalize.indexOf("watchPreviewJob(created.jobId, { until: 'cover' })", createIndex)

  assert.ok(createIndex >= 0)
  assert.ok(creationIndex > createIndex && creationIndex < watchIndex)
  assert.ok(jobIndex > createIndex && jobIndex < watchIndex)
  assert.match(personalize, /replacePreviewUrl\(created\.creationId, created\.jobId\)/)
  assert.doesNotMatch(personalize, /handleSelectPreviewVariant|commitSelectedPreviewForExit/)
  assert.match(personalize, /key=\{displayedPreviewJobId \?\? 'preview-book'\}/)
})

test('late image responses cannot overwrite a different selected photo version', () => {
  assert.match(
    controller,
    /activeJobIdRef\.current && activeJobIdRef\.current !== jobId[\s\S]*?return false/
  )
  assert.match(
    controller,
    /getPreviewJobState\(jobId,[\s\S]*?applyPreviewDisplayAssetsForJob\(jobId, assets, reason === 'image-error'\)/
  )
  assert.doesNotMatch(personalize, /getPreviewPageAssets/)
  assert.match(personalize, /selectedPreviewCreationIdRef\.current = created\.creationId/)
  assert.match(personalize, /cancelPreviewWatch\(sourcePreviewJobId\)/)
  assert.match(personalize, /setPreviewPages\(\[\]\)/)
})
