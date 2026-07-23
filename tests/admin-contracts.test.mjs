import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

async function listFiles(directory, fileName) {
  const result = []
  const entries = await readdir(path.join(root, directory), { withFileTypes: true })
  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      result.push(...(await listFiles(relativePath, fileName)))
    } else if (entry.isFile() && (!fileName || entry.name === fileName)) {
      result.push(relativePath)
    }
  }
  return result
}

test('the protected Admin layout remains the page-level authorization gate', async () => {
  const source = await read('app/admin/(protected)/layout.tsx')

  assert.match(source, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(source, /if\s*\(\s*!admin\s*\)\s*redirect\s*\(\s*['"]\/admin\/login['"]\s*\)/)
  assert.match(source, /<AdminShell/)
})

test('the protected Admin shell owns scoped loading and error boundaries', async () => {
  const loading = await read('app/admin/(protected)/loading.tsx')
  const errorBoundary = await read('app/admin/(protected)/error.tsx')

  assert.match(loading, /role="status"/)
  assert.match(errorBoundary, /^'use client'/)
  assert.match(errorBoundary, /onClick=\{reset\}/)
  assert.match(errorBoundary, /href="\/admin\/finals"/)
})

test('every exported Admin API method performs its own authorization check', async () => {
  const routeFiles = await listFiles('app/api/admin', 'route.ts')
  assert.equal(routeFiles.length, 19, 'Update the reviewed Admin API inventory when routes are added or removed')

  for (const routeFile of routeFiles) {
    const source = await read(routeFile)
    const methods = [
      ...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g),
    ].map((match) => match[1])
    const authCalls = [...source.matchAll(/await\s+requireAdminCustomer\s*\(\s*\)/g)]

    assert.ok(methods.length > 0, `${routeFile} has no exported HTTP method`)
    assert.match(source, /from\s+['"]@\/lib\/adminAuth['"]/)
    assert.equal(
      authCalls.length,
      methods.length,
      `${routeFile} must authorize each exported method independently (${methods.join(', ')})`
    )
  }
})

test('active and placeholder Admin pages remain explicitly separated', async () => {
  const activePages = new Map([
    ['announcements', 'AnnouncementsSection'],
    ['discounts', 'DiscountManagementSection'],
    ['emails', 'email_events'],
    ['finals', 'FinalReviewPanel'],
    ['orders', 'OrdersManagementSection'],
    ['service', 'ServiceControlSection'],
  ])
  const placeholderPages = ['analytics', 'banner', 'catalog']

  for (const [route, marker] of activePages) {
    const source = await read(`app/admin/(protected)/${route}/page.tsx`)
    assert.match(source, new RegExp(marker))
    assert.doesNotMatch(source, /Coming soon/i)
  }

  for (const route of placeholderPages) {
    const source = await read(`app/admin/(protected)/${route}/page.tsx`)
    assert.match(source, /Coming soon/i)
  }
})

test('Admin client components never import the service-role Supabase client', async () => {
  const componentFiles = (await listFiles('components/admin')).filter((file) => /\.(ts|tsx)$/.test(file))

  for (const componentFile of componentFiles) {
    const source = await read(componentFile)
    assert.doesNotMatch(
      source,
      /@\/lib\/supabaseAdmin/,
      `${componentFile} must use authenticated Admin APIs rather than service-role access`
    )
  }
})

test('Final Review preserves server authority and stale-response intent guards', async () => {
  const panel = await read('components/admin/FinalReviewPanel.tsx')
  const jobQueue = await read('components/admin/final-review/JobQueue.tsx')
  const pdfReview = await read('components/admin/final-review/PdfVersionReview.tsx')
  const printReview = await read('components/admin/final-review/PrintVersionReview.tsx')
  const printDialog = await read('components/admin/final-review/PrintPageDialog.tsx')
  const stage = await read('components/admin/final-review/FinalReviewStage.tsx')
  const stageDock = await read(
    'components/admin/final-review/useFinalReviewStageDock.ts'
  )
  const thumbnail = await read('components/admin/final-review/thumbnail.tsx')
  const releaseApi = await read('app/api/admin/final-jobs/[finalJobId]/release/route.ts')
  const printReleaseApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/release-print/route.ts'
  )
  const replacementApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/route.ts'
  )
  const printUploadApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-print-page/route.ts'
  )
  const finalReview = await read('src/lib/finalReview.ts')

  assert.match(panel, /reviewIntentRef/)
  assert.match(panel, /reviewIntentRef\.current\[page\.final_job_page_id\]\s*!==\s*reviewIntentId/)
  assert.match(panel, /detailRequestIntentRef/)
  assert.match(panel, /detailAbortControllerRef/)
  assert.match(panel, /signal:\s*controller\.signal/)
  assert.match(panel, /detailRequestIntentRef\.current\s*!==\s*requestIntent/)
  assert.match(panel, /fetch\(['"]\/api\/admin\/final-jobs/)
  assert.doesNotMatch(panel, /supabaseAdmin/)
  assert.match(panel, /<JobQueue/)
  assert.match(panel, /<PdfVersionReview/)
  assert.match(panel, /<PrintVersionReview/)
  assert.match(panel, /<PrintPageDialog/)
  assert.match(panel, /<FinalReviewStage/)
  assert.match(panel, /uploadPendingByPage/)
  assert.match(panel, /setPageUploadPending/)
  assert.match(panel, /type UploadTarget = \{ finalJobId: string; page: FinalJobPageRow \}/)
  assert.match(panel, /patchPage\(finalJobId,\s*page\.final_job_page_id/)
  assert.match(panel, /detail\?\.finalJob\.final_job_id === selectedJobId/)
  assert.match(panel, /currentUploadPendingByPage/)
  assert.match(panel, /currentReviewPendingByPage/)
  assert.match(panel, /refreshSignedUrls/)
  assert.match(panel, /signedUrlRequestIntentRef/)
  assert.match(panel, /SIGNED_URL_REFRESH_INTERVAL_MS = 18 \* 60 \* 1000/)
  assert.match(panel, /ai_url:\s*signedPage\.ai_url/)
  assert.match(panel, /approved_url:\s*signedPage\.approved_url/)

  const releaseSection = panel.slice(
    panel.indexOf('const releaseJob'),
    panel.indexOf('const uploadReplacement')
  )
  const printReleaseSection = panel.slice(
    panel.indexOf('const releasePrintVersion'),
    panel.indexOf('const pages = useMemo')
  )
  assert.match(releaseSection, /patchFinalJob/)
  assert.match(printReleaseSection, /patchFinalJob/)
  assert.doesNotMatch(releaseSection, /loadJobs|loadDetail|await refresh/)
  assert.doesNotMatch(printReleaseSection, /loadJobs|loadDetail|await refresh/)

  for (const [name, source] of [
    ['job queue', jobQueue],
    ['PDF review', pdfReview],
    ['print review', printReview],
    ['print dialog', printDialog],
    ['release stage', stage],
  ]) {
    assert.doesNotMatch(source, /fetch\s*\(/, `${name} must remain a presentation island`)
  }

  assert.match(stageDock, /ResizeObserver/)
  assert.match(stageDock, /requestAnimationFrame/)
  assert.match(thumbnail, /ymi-admin-final-thumbs/)
  assert.match(thumbnail, /createImageBitmap/)
  assert.match(thumbnail, /state\.sourceUrl === sourceUrl/)
  assert.match(thumbnail, /onError=\{onError\}/)

  assert.match(releaseApi, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(releaseApi, /releaseFinalJob/)
  assert.match(printReleaseApi, /printReleasedAt/)
  assert.match(printReleaseApi, /printCompletedPages/)
  assert.match(replacementApi, /manualUrl:\s*signedManual\?\.signedUrl/)
  assert.match(replacementApi, /approvedUrl:\s*signedApproved\?\.signedUrl/)
  assert.match(printUploadApi, /printUrl:\s*signed\?\.signedUrl/)
  assert.match(finalReview, /\.from\(['"]final_jobs['"]\)/)
  assert.match(finalReview, /review_status:\s*['"]released['"]/)
  assert.match(finalReview, /sendOrderDeliveryEmail/)
  assert.match(finalReview, /releasedAt:/)
  assert.match(finalReview, /emailSentAt/)
  assert.match(finalReview, /approvedPages:/)
})

test('Service Control keeps independent islands and fails visibly on Admin reads', async () => {
  const section = await read('components/admin/sections/ServiceControlSection.tsx')
  const customizeControl = await read(
    'components/admin/sections/service/CustomizeAccessControl.tsx'
  )
  const promoControl = await read('components/admin/sections/service/CreatorPromoControl.tsx')
  const customizeApi = await read('app/api/admin/customize-access/route.ts')
  const promoApi = await read('app/api/admin/creator-promo-config/route.ts')

  assert.match(section, /<CustomizeAccessControl\s*\/>/)
  assert.match(section, /<CreatorPromoControl\s*\/>/)
  assert.match(customizeControl, /requestIntentRef/)
  assert.match(customizeControl, /setSettings\(previous\)/)
  assert.match(promoControl, /requestIntentRef/)
  assert.match(promoControl, /savedConfig/)
  assert.match(promoControl, /draftConfig/)
  assert.match(customizeApi, /failOnError:\s*true/)
  assert.match(promoApi, /if\s*\(error\)\s*throw error/)
})

test('Discounts keeps create, list, and row mutations in independent state islands', async () => {
  const section = await read('components/admin/sections/DiscountManagementSection.tsx')
  const creator = await read('components/admin/sections/discounts/DiscountCreator.tsx')
  const card = await read(
    'components/admin/sections/discounts/DiscountInstrumentCard.tsx'
  )
  const discountsApi = await read('app/api/admin/discounts/route.ts')

  assert.match(section, /<DiscountCreator\s+onCreated=\{handleCreated\}/)
  assert.match(section, /<DiscountInstrumentCard/)
  assert.match(section, /listRequestIntentRef/)
  assert.match(section, /invalidateInFlightListRequest/)
  assert.match(creator, /requestIntentRef/)
  assert.match(creator, /onCreated\(data\.instrument\)/)
  assert.doesNotMatch(creator, /reloadDiscounts/)
  assert.match(card, /setDisplayInstrument\(optimistic\)/)
  assert.match(card, /setDisplayInstrument\(previous\)/)
  assert.match(card, /requestIntentRef/)
  assert.doesNotMatch(card, /reloadDiscounts/)
  assert.match(discountsApi, /['"]Cache-Control['"]:\s*['"]no-store['"]/)
  assert.match(discountsApi, /Provide exactly one discount offer or instrument id/)
  assert.match(discountsApi, /\.select\(['"]instrument_id, is_active['"]\)/)
  assert.match(discountsApi, /instrument:\s*\{/)
})

test('Orders keeps drafts row-scoped and reconciles logistics side effects from the server', async () => {
  const section = await read('components/admin/sections/OrdersManagementSection.tsx')
  const card = await read('components/admin/sections/orders/OrderManagementCard.tsx')
  const types = await read('components/admin/sections/orders/types.ts')
  const ordersApi = await read('app/api/admin/orders/route.ts')
  const logisticsApi = await read(
    'app/api/admin/orders/[orderId]/logistics/route.ts'
  )

  assert.match(section, /<OrderManagementCard/)
  assert.match(section, /listRequestIntentRef/)
  assert.doesNotMatch(section, /savingId/)
  assert.doesNotMatch(section, /setDrafts/)
  assert.match(card, /const \[draft,\s*setDraft\]/)
  assert.match(card, /const \[saving,\s*setSaving\]/)
  assert.match(card, /requestIntentRef/)
  assert.match(card, /if\s*\(data\?\.persisted\s*===\s*true/)
  assert.match(card, /data\.emailStatus\s*===\s*['"]failed['"]/)
  assert.doesNotMatch(card, /reloadOrders/)
  assert.match(types, /READONLY_GROUPS/)
  assert.match(ordersApi, /['"]Cache-Control['"]:\s*['"]no-store['"]/)
  assert.match(logisticsApi, /sendLogisticsUpdateEmail/)
  assert.match(logisticsApi, /persisted:\s*true/)
  assert.match(logisticsApi, /order:\s*updatedOrder/)
})

test('Announcements separates list, status rows, and the editor upload workspace', async () => {
  const section = await read('components/admin/sections/AnnouncementsSection.tsx')
  const workspace = await read(
    'components/admin/sections/announcements/AnnouncementWorkspace.tsx'
  )
  const listItem = await read(
    'components/admin/sections/announcements/AnnouncementListItem.tsx'
  )
  const blogApi = await read('app/api/admin/blog-posts/route.ts')
  const postApi = await read('app/api/admin/blog-posts/[postId]/route.ts')

  assert.match(section, /<AnnouncementList/)
  assert.match(section, /<AnnouncementWorkspace/)
  assert.match(section, /listRequestIntentRef/)
  assert.match(section, /invalidateInFlightListRequest/)
  assert.doesNotMatch(section, /setForm/)
  assert.doesNotMatch(section, /uploading/)
  assert.match(workspace, /const \[form,\s*setForm\]/)
  assert.match(workspace, /saveRequestIntentRef/)
  assert.match(workspace, /uploadRequestIntentRef/)
  assert.match(workspace, /objectUrlsRef/)
  assert.match(workspace, /MAX_IMAGES\s*-\s*form\.imageStoragePaths\.length/)
  assert.doesNotMatch(workspace, /loadPosts/)
  assert.match(listItem, /requestIntentRef/)
  assert.match(listItem, /onStatusCommitted\(data\.post\)/)
  assert.doesNotMatch(listItem, /loadPosts/)
  assert.match(blogApi, /['"]Cache-Control['"]:\s*['"]no-store['"]/)
  assert.match(blogApi, /image_urls:\s*await Promise\.all/)
  assert.match(postApi, /image_urls:\s*await Promise\.all/)
  assert.match(postApi, /Announcement not found/)
})

test('Email Events keeps service-role reads server-side with scoped filter navigation', async () => {
  const page = await read('app/admin/(protected)/emails/page.tsx')
  const panel = await read('components/admin/sections/emails/EmailEventsPanel.tsx')
  const types = await read('components/admin/sections/emails/types.ts')

  assert.match(page, /from\s+['"]@\/lib\/supabaseAdmin['"]/)
  assert.match(page, /\.from\(['"]email_events['"]\)/)
  assert.match(page, /<EmailEventsPanel/)
  assert.match(page, /key=\{`\$\{filters\.status\}:\$\{filters\.provider\}:\$\{filters\.emailKey\}`\}/)
  assert.match(page, /\.limit\(100\)/)
  assert.doesNotMatch(panel, /supabaseAdmin/)
  assert.match(panel, /router\.replace\(href,\s*\{\s*scroll:\s*false\s*\}\)/)
  assert.match(panel, /router\.refresh\(\)/)
  assert.match(panel, /isBrowserTranslated\(\)/)
  assert.match(panel, /window\.location\.assign\(href\)/)
  assert.match(panel, /window\.location\.reload\(\)/)
  assert.match(panel, /lg:hidden/)
  assert.match(panel, /hidden overflow-x-auto lg:block/)
  assert.match(panel, /Failed to load email events/)
  assert.match(panel, /No email events match the current filters/)
  assert.match(types, /normalizeEmailEventFilters/)
  assert.match(types, /options\.includes\(normalized\)/)
})
