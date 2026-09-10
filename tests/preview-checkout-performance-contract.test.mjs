import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Preview warms Checkout and reuses a successful preview commit', async () => {
  const personalize = await read('components/PersonalizePage.tsx')

  assert.match(
    personalize,
    /if \(!viewState\.showPreview\) return;\s*router\.prefetch\('\/checkout'\)/
  )
  assert.match(personalize, /const committedPreviewSelectionRef = useRef/)
  assert.match(personalize, /const previewCommitInFlightRef = useRef/)
  assert.match(
    personalize,
    /committedSelection\?\.creationId === ensuredCreationId[\s\S]*?return committedSelection\.activePreviewJobId/
  )
  assert.match(
    personalize,
    /currentCommit\?\.key === commitKey[\s\S]*?currentCommit\.promise[\s\S]*?: commitPreviewVariant/
  )
})

test('Order Start schedules unpaid reminders after the checkout response path', async () => {
  const orderStart = await read('app/api/orders/start/route.ts')
  const cartPersistenceIndex = orderStart.indexOf('for (const item of resolvedItems)')
  const deferredReminderIndex = orderStart.indexOf('after(async () =>')
  const responseIndex = orderStart.lastIndexOf('return NextResponse.json')

  assert.match(orderStart, /import \{ after, NextResponse \} from 'next\/server'/)
  assert.match(orderStart, /async function ensureUnpaidOrderReminderSchedule/)
  assert.ok(deferredReminderIndex > cartPersistenceIndex)
  assert.ok(responseIndex > deferredReminderIndex)
})

test('committing the original Preview reuses the already-loaded current job', async () => {
  const commitRoute = await read(
    'app/api/creations/[creationId]/preview-variants/commit/route.ts'
  )

  assert.match(commitRoute, /let selectedJob = currentJob/)
  assert.match(
    commitRoute,
    /if \(selectedPreviewJobId !== String\(creation\.preview_job_id\)\) \{[\s\S]*?\.from\('jobs'\)/
  )
})
