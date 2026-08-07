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

test('desktop Admin scroll ownership stays lg-gated while mobile keeps document scroll', async () => {
  const shell = await read('components/admin/AdminShell.tsx')
  const sidebar = await read('components/admin/AdminSidebar.tsx')
  const announcementWorkspace = await read(
    'components/admin/sections/announcements/AnnouncementWorkspace.tsx'
  )

  assert.match(shell, /min-h-dvh[^"]*lg:h-dvh[^"]*lg:overflow-hidden/)
  assert.match(
    shell,
    /<section className="[^"]*lg:h-dvh[^"]*lg:min-h-0[^"]*lg:overflow-y-auto/
  )
  assert.doesNotMatch(shell, /<main className="[^"]*\sh-dvh(?:\s|")/)
  assert.match(sidebar, /hidden min-h-0 flex-col[^"]*lg:flex lg:h-dvh/)
  assert.doesNotMatch(sidebar, /lg:sticky|lg:top-0/)
  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto/)
  assert.match(sidebar, /mt-4 shrink-0 border-t/)
  assert.match(sidebar, /document\.body\.style\.overflow = ['"]hidden['"]/)
  assert.match(announcementWorkspace, /xl:top-6/)
  assert.match(announcementWorkspace, /calc\(100dvh-3rem\)/)
  assert.doesNotMatch(announcementWorkspace, /calc\(100vh-/)
})

test('every exported Admin API method performs its own authorization check', async () => {
  const routeFiles = await listFiles('app/api/admin', 'route.ts')
  assert.equal(routeFiles.length, 25, 'Update the reviewed Admin API inventory when routes are added or removed')

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

test('Final Review detail uses the protected no-store V2 page read model', async () => {
  const [route, readModel] = await Promise.all([
    read('app/api/admin/final-jobs/[finalJobId]/route.ts'),
    read('src/lib/admin-final-page-read-model.ts'),
  ])

  assert.match(route, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(route, /Cache-Control['"],\s*['"]no-store/)
  assert.match(route, /\.from\(['"]jobs['"]\)[\s\S]*\.select\(['"]output_assets['"]\)/)
  assert.match(route, /buildAdminFinalPageReadModel/)
  assert.match(route, /page_contract:\s*readModel\.page_contract/)
  assert.match(readModel, /parseFinalPageMetadataContract/)
  assert.doesNotMatch(readModel, /\.\.\.page/)
})

test('active and placeholder Admin pages remain explicitly separated', async () => {
  const activePages = new Map([
    ['announcements', 'AnnouncementsSection'],
    ['discounts', 'DiscountManagementSection'],
    ['emails', 'email_events'],
    ['finals', 'FinalReviewPanel'],
    ['legal', 'LegalContentSection'],
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

test('Legal Content preserves draft isolation, atomic publishing, and immutable history', async () => {
  const sql = await read('../Template_folder/sql_legal_content_publishing.sql')
  const publishing = await read('src/lib/legal-publishing.ts')
  const store = await read('src/lib/legal-publishing-store.ts')
  const rootApi = await read('app/api/admin/legal-documents/route.ts')
  const documentApi = await read('app/api/admin/legal-documents/[documentKey]/route.ts')
  const publishApi = await read(
    'app/api/admin/legal-documents/[documentKey]/publish/route.ts'
  )
  const rollbackApi = await read(
    'app/api/admin/legal-documents/[documentKey]/rollback/route.ts'
  )
  const section = await read('components/admin/sections/LegalContentSection.tsx')
  const editor = await read('components/admin/legal/LegalDocumentEditor.tsx')
  const history = await read('components/admin/legal/LegalRevisionHistory.tsx')
  const preview = await read('components/admin/legal/LegalDraftPreview.tsx')
  const publicConsumers = await Promise.all([
    read('components/Footer.tsx'),
    read('app/checkout/CheckoutPolicyModal.tsx'),
    read('components/legal/LegalDocumentPage.tsx'),
    read('src/lib/legal-documents.ts'),
  ])

  assert.match(sql, /current_published_revision_id uuid/)
  assert.match(sql, /unique \(document_id, revision_id\)/)
  assert.match(sql, /deferrable initially deferred/)
  assert.match(sql, /idx_legal_document_one_active_draft/)
  assert.match(sql, /for update/g)
  assert.match(sql, /errcode = '40001'/)
  assert.match(sql, /Published legal revisions are immutable/)
  assert.match(sql, /Legal publishing audit history is immutable/)
  assert.match(sql, /insert into public\.legal_document_revisions[\s\S]*'published'/)
  assert.match(sql, /'rolled_back'/)
  assert.match(sql, /revoke all on table public\.legal_documents from public, anon, authenticated/)
  assert.match(sql, /revoke all on table public\.legal_documents from service_role/)
  assert.match(sql, /grant select on table public\.legal_documents to service_role/)
  assert.doesNotMatch(sql, /grant select,\s*insert|grant insert|grant update/)
  assert.match(sql, /grant execute on function public\.publish_legal_document_draft/)

  assert.match(publishing, /normalizeLegalRevisionContent/)
  assert.match(publishing, /HTML_TAG_PATTERN/)
  assert.match(publishing, /LegalPublishingConflictError/)
  assert.match(store, /\.rpc\(name, params\)/)
  assert.match(store, /bootstrapAdminLegalDocuments/)
  assert.match(store, /getCanonicalLegalDocuments\(\)/)

  for (const api of [rootApi, documentApi, publishApi, rollbackApi]) {
    assert.match(api, /['"]Cache-Control['"]:\s*['"]no-store['"]/)
  }
  assert.match(documentApi, /saveAdminLegalDraft/)
  assert.match(publishApi, /publishAdminLegalDraft/)
  assert.match(rollbackApi, /rollbackAdminLegalRevision/)

  assert.match(section, /listRequestIntentRef/)
  assert.match(section, /detailRequestIntentRef/)
  assert.match(section, /detailAbortControllerRef/)
  assert.match(section, /<LegalDocumentPicker/)
  assert.match(section, /<LegalDocumentEditor/)
  assert.match(section, /<LegalRevisionHistory/)
  assert.match(editor, /expectedDraftVersion/)
  assert.match(editor, /basePublishedRevisionId/)
  assert.match(history, /expectedCurrentPublishedRevisionId/)
  assert.doesNotMatch(editor + history + preview, /dangerouslySetInnerHTML/)

  for (const publicConsumer of publicConsumers) {
    assert.doesNotMatch(publicConsumer, /legal-publishing|legal_documents/)
  }
})

test('Final Review preserves server authority and stale-response intent guards', async () => {
  const panel = await read('components/admin/FinalReviewPanel.tsx')
  const jobQueue = await read('components/admin/final-review/JobQueue.tsx')
  const pdfReview = await read('components/admin/final-review/PdfVersionReview.tsx')
  const printReview = await read('components/admin/final-review/PrintVersionReview.tsx')
  const stage = await read('components/admin/final-review/FinalReviewStage.tsx')
  const finalsPage = await read('app/admin/(protected)/finals/page.tsx')
  const finalReviewFiles = await listFiles('components/admin/final-review')
  const thumbnail = await read('components/admin/final-review/thumbnail.tsx')
  const releaseApi = await read('app/api/admin/final-jobs/[finalJobId]/release/route.ts')
  const printReleaseApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/release-print/route.ts'
  )
  const replacementApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/route.ts'
  )
  const printUploadUrlApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/print-package/upload-url/route.ts'
  )
  const printConfirmApi = await read(
    'app/api/admin/final-jobs/[finalJobId]/print-package/confirm/route.ts'
  )
  const manualPrintPolicy = await read('src/lib/manual-print-artifact.ts')
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
  assert.doesNotMatch(panel, /PrintPageDialog|uploadPrintPage/)
  assert.match(panel, /<FinalReviewStage/)
  assert.match(
    panel,
    /min-h-0 xl:h-full xl:w-64 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.match(
    panel,
    /min-h-0 min-w-0 flex-1 overflow-x-clip[^"]*xl:h-full xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.doesNotMatch(
    panel,
    /min-w-0 flex-1 overflow-hidden/,
    'the center review pane must retain independent horizontal clipping'
  )
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
    ['release stage', stage],
  ]) {
    assert.doesNotMatch(source, /fetch\s*\(/, `${name} must remain a presentation island`)
  }

  assert.match(
    stage,
    /min-h-0 space-y-4 xl:h-full xl:w-80 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.doesNotMatch(stage, /useFinalReviewStageDock|fixed z-30|stageDockMetrics/)
  assert.match(finalsPage, /xl:h-\[calc\(100dvh-3rem\)\][^"]*xl:min-h-0 xl:flex-col/)
  assert.equal(
    finalReviewFiles.some((file) => file.endsWith('useFinalReviewStageDock.ts')),
    false,
    'Final Review must use native sticky positioning without a JS docking hook'
  )
  assert.match(thumbnail, /ymi-admin-final-thumbs/)
  assert.match(thumbnail, /createImageBitmap/)
  assert.match(thumbnail, /IntersectionObserver/)
  assert.match(thumbnail, /inFlightThumbs/)
  assert.match(thumbnail, /state\.sourceUrl === sourceUrl/)
  assert.match(thumbnail, /onError=\{onError\}/)

  assert.match(releaseApi, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(releaseApi, /releaseFinalJob/)
  assert.match(printReleaseApi, /printReleasedAt/)
  assert.match(printReleaseApi, /release_final_print_artifact/)
  assert.match(replacementApi, /manualUrl:\s*signedManual\?\.signedUrl/)
  assert.match(replacementApi, /approvedUrl:\s*signedManual\?\.signedUrl/)
  assert.match(replacementApi, /hasManualOutput:\s*true/)
  assert.match(replacementApi, /hasApprovedOutput:\s*true/)
  assert.match(printUploadUrlApi, /createSignedUploadUrl/)
  assert.match(printUploadUrlApi, /create_final_print_artifact/)
  assert.match(printConfirmApi, /commit_final_print_artifact/)
  assert.match(printConfirmApi, /verifyRemotePdfHeader/)
  assert.match(manualPrintPolicy, /Range:\s*['"]bytes=0-4['"]/)
  assert.match(finalReview, /\.from\(['"]final_jobs['"]\)/)
  assert.match(finalReview, /review_status:\s*['"]released['"]/)
  assert.match(finalReview, /sendOrderDeliveryEmail/)
  assert.match(finalReview, /releasedAt:/)
  assert.match(finalReview, /emailSentAt/)
  assert.match(finalReview, /approvedPages:/)
})

test('Final Review responsive scroll behavior stays breakpoint-scoped', async () => {
  const panel = await read('components/admin/FinalReviewPanel.tsx')
  const stage = await read('components/admin/final-review/FinalReviewStage.tsx')
  const sidebar = await read('components/admin/AdminSidebar.tsx')
  const finalsPage = await read('app/admin/(protected)/finals/page.tsx')

  assert.match(panel, /xl:flex-1 xl:flex-row xl:items-stretch xl:overflow-hidden/)
  assert.match(
    panel,
    /min-h-0 xl:h-full xl:w-64 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.match(
    stage,
    /min-h-0 space-y-4 xl:h-full xl:w-80 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.match(finalsPage, /xl:h-\[calc\(100dvh-3rem\)\]/)
  assert.match(panel, /lg:sticky lg:top-0 lg:z-10/)
  assert.doesNotMatch(panel, /className="sticky top-0 z-10/)
  assert.match(panel, /2xl:flex-row 2xl:items-center 2xl:justify-between/)
  assert.match(panel, /2xl:w-\[16rem\]/)
  assert.doesNotMatch(panel, /gap-3 lg:flex-row/)
  assert.doesNotMatch(panel, /p-0\.5 lg:w-\[16rem\]/)
  assert.match(sidebar, /sticky top-0 z-40[^"]*lg:hidden/)
  assert.match(sidebar, /fixed inset-0 z-\[180\] lg:hidden/)
})

test('Final Review V2 PDF workspace and manual Print handoff add no nested scroll owners', async () => {
  const [panel, pdfReview, printReview, workspace] = await Promise.all([
    read('components/admin/FinalReviewPanel.tsx'),
    read('components/admin/final-review/PdfVersionReview.tsx'),
    read('components/admin/final-review/PrintVersionReview.tsx'),
    read('src/lib/admin-final-review-workspace.ts'),
  ])

  assert.match(panel, /pageContract=\{pageContract\}/)
  assert.match(pdfReview, /buildFinalReviewWorkspace/)
  assert.match(pdfReview, /aria-label="Final page navigator"/)
  assert.match(pdfReview, /aria-pressed=\{selected\}/)
  assert.match(pdfReview, /aspect-square/)
  assert.doesNotMatch(printReview, /buildFinalReviewWorkspace|final_job_pages/)
  assert.match(printReview, /Manual print artifact/)
  assert.match(workspace, /final_back_cover/)
  assert.match(workspace, /final_front_cover/)
  assert.match(workspace, /page\.spread_index/)
  assert.match(workspace, /page\.page_number/)
  assert.doesNotMatch(workspace, /template_image|filename|_L|_R|_A|_B/)
  assert.doesNotMatch(pdfReview + printReview, /overflow-y-auto|overflow-y-scroll/)
  assert.doesNotMatch(workspace, /spreadIndex\s*<=\s*15|length\s*===\s*15/)
})

test('Final Review derives personalized job titles and keeps queue status rows stable', async () => {
  const panel = await read('components/admin/FinalReviewPanel.tsx')
  const jobQueue = await read('components/admin/final-review/JobQueue.tsx')
  const finalReviewTypes = await read('src/lib/finalReview.ts')
  const listApi = await read('app/api/admin/final-jobs/route.ts')
  const detailApi = await read('app/api/admin/final-jobs/[finalJobId]/route.ts')

  for (const [name, source] of [
    ['list API', listApi],
    ['detail API', detailApi],
  ]) {
    assert.match(source, /resolveFinalJobDisplayTitle/)
    assert.match(source, /customize_snapshot/)
    assert.match(source, /templates:templates\(name\)/)
    assert.match(source, /display_title:/)
    assert.match(
      source,
      /const \{ creations, \.\.\.summary \}/,
      `${name} must not expose the full customization snapshot to the client`
    )
  }

  assert.match(finalReviewTypes, /display_title:\s*string/)
  assert.match(jobQueue, /\{job\.display_title\}/)
  assert.doesNotMatch(jobQueue, /\{job\.template_id\}/)
  assert.match(jobQueue, /grid grid-cols-2 gap-2/)
  assert.match(jobQueue, /line-clamp-2 break-words/)
  assert.match(panel, /\{selectedJob\.display_title\}/)
  assert.doesNotMatch(panel, /\{selectedJob\.template_id\}/)
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
