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

test('Admin login keeps role authority while presenting the production console identity', async () => {
  const [page, client, layout] = await Promise.all([
    read('app/admin/login/page.tsx'),
    read('components/admin/AdminLoginClient.tsx'),
    read('app/admin/layout.tsx'),
  ])

  assert.match(page, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(page, /await\s+getAuthenticatedCustomer\s*\(\s*\)/)
  assert.match(page, /redirect\(['"]\/admin\/finals['"]\)/)
  assert.match(client, /loginAction\(formData\)/)
  assert.match(client, /window\.location\.assign\(ADMIN_LANDING_PATH\)/)
  assert.doesNotMatch(client, /router\.(?:push|replace)\(['"]\/admin/)
  assert.match(client, /signInWithOAuth/)
  assert.match(client, /const ADMIN_LANDING_PATH = ['"]\/admin\/finals['"]/)
  assert.match(client, /next=\$\{encodeURIComponent\(ADMIN_LANDING_PATH\)\}/)
  assert.match(client, /autoComplete="current-password"/)
  assert.match(client, /aria-label=\{showPassword \? ['"]Hide password['"] : ['"]Show password['"]\}/)
  assert.match(client, /src="\/logo\.webp"/)
  assert.match(page, /src="\/logo\.webp"/)
  assert.match(client, />Operations</)
  assert.doesNotMatch(client, /Admin V1|reserved for the next phases/i)
  assert.match(layout, /index:\s*false/)
  assert.match(layout, /follow:\s*false/)
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
  const navigation = await read('components/admin/adminNavigation.ts')
  const globals = await read('app/globals.css')
  const announcementWorkspace = await read(
    'components/admin/sections/announcements/AnnouncementWorkspace.tsx'
  )

  assert.match(shell, /min-h-dvh[^"]*lg:h-dvh[^"]*lg:overflow-hidden/)
  assert.match(
    shell,
    /<section className="[^"]*lg:min-h-0[^"]*lg:flex-1[^"]*lg:overflow-y-auto/
  )
  assert.doesNotMatch(shell, /<main className="[^"]*\sh-dvh(?:\s|")/)
  assert.match(sidebar, /hidden min-h-0 flex-col[^"]*lg:flex lg:h-full/)
  assert.doesNotMatch(sidebar, /lg:sticky|lg:top-0/)
  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto/)
  assert.match(sidebar, /mt-2 shrink-0/)
  assert.match(sidebar, /document\.body\.style\.overflow = ['"]hidden['"]/)
  assert.match(sidebar, /src="\/logo\.webp"/)
  assert.doesNotMatch(sidebar, />\s*Y\s*</)
  assert.doesNotMatch(sidebar, /currentItem\?\.label|getAdminNavigationItem/)
  assert.match(shell, /ymi-admin-theme/)
  // Route identity is owned by each page header; the shell adds no duplicate title row.
  assert.doesNotMatch(shell, /AdminCommandBar|YMI Operations/)
  assert.match(shell, /<AdminSidebar adminName=\{adminName\} adminEmail=\{adminEmail\}/)
  assert.match(sidebar, /getAdminNavigationGroups\(\)/)
  assert.match(navigation, /export const adminNavigationItems/)
  assert.match(globals, /\.ymi-admin-theme/)
  assert.match(globals, /\.admin-v2-workspace/)
  assert.match(announcementWorkspace, /xl:sticky xl:top-0/)
  assert.doesNotMatch(announcementWorkspace, /h-dvh|h-screen|calc\(100(?:d)?vh/)
})

test('every exported Admin API method performs its own authorization check', async () => {
  const routeFiles = await listFiles('app/api/admin', 'route.ts')
  assert.equal(routeFiles.length, 44, 'Update the reviewed Admin API inventory when routes are added or removed')

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
    ['support', 'SupportInbox'],
    ['inbox', 'GeneralInbox'],
    ['catalog', 'CatalogPricingManager'],
    ['partnerships', 'KolPartnershipWorkspace'],
    ['banner', 'HomepageBannerManager'],
  ])
  const placeholderPages = ['analytics']

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
  assert.match(panel, /fetch\(`\/api\/admin\/final-jobs/)
  assert.doesNotMatch(panel, /supabaseAdmin/)
  assert.match(panel, /<JobQueue/)
  assert.match(panel, /<PdfVersionReview/)
  assert.match(panel, /<PrintVersionReview/)
  assert.doesNotMatch(panel, /PrintPageDialog|uploadPrintPage/)
  assert.match(panel, /<FinalReviewStage/)
  assert.match(
    panel,
    /min-h-0 xl:h-full xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.match(
    panel,
    /min-w-0 overflow-x-clip[^"]*xl:h-full xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain/
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
  assert.match(finalsPage, /xl:h-full[^"]*xl:min-h-0 xl:flex-col/)
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
  const jobQueue = await read('components/admin/final-review/JobQueue.tsx')
  const statCard = await read('components/admin/final-review/StatCard.tsx')
  const stage = await read('components/admin/final-review/FinalReviewStage.tsx')
  const pdfReview = await read('components/admin/final-review/PdfVersionReview.tsx')
  const generalInbox = await read('components/admin/sections/inbox/GeneralInbox.tsx')
  const emailThread = await read('components/admin/email/AdminEmailThread.tsx')
  const sidebar = await read('components/admin/AdminSidebar.tsx')
  const finalsPage = await read('app/admin/(protected)/finals/page.tsx')
  const globals = await read('app/globals.css')

  // Mobile/tablet owns one vertical review scroll so every page and release action
  // remains reachable. XL restores the bounded, independently scrolling columns.
  assert.match(panel, /min-h-0 xl:flex-1 xl:overflow-hidden/)
  assert.match(panel, /min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.match(panel, /xl:flex-row xl:items-stretch/)
  assert.match(
    panel,
    /min-h-0 xl:h-full xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.match(
    stage,
    /min-h-0 space-y-4 xl:h-full xl:w-80 xl:shrink-0 xl:overflow-y-auto xl:overscroll-contain/
  )
  assert.match(finalsPage, /xl:h-full/)
  assert.match(panel, /lg:sticky lg:top-0 lg:z-10/)
  assert.doesNotMatch(panel, /className="sticky top-0 z-10/)
  assert.match(panel, /2xl:flex-row 2xl:items-center 2xl:justify-between/)
  assert.match(panel, /2xl:w-\[16rem\]/)
  assert.doesNotMatch(panel, /gap-3 lg:flex-row/)
  assert.doesNotMatch(panel, /p-0\.5 lg:w-\[16rem\]/)
  assert.match(pdfReview, /min-h-11[^\"]*sm:min-h-9/)
  assert.match(generalInbox, /AdminEmailComposer/)
  assert.match(emailThread, /mt-2 flex flex-col gap-2 sm:flex-row/)
  assert.match(emailThread, /className="w-full sm:w-auto"/)
  assert.match(panel, /useState<FinalReviewQueueFilter>\(['"]all['"]\)/)
  assert.match(panel, /filterFinalJobs\(jobs, queueFilter\)/)
  assert.match(panel, /jobs=\{visibleJobs\}/)
  assert.match(panel, /handleQueueFilterChange\(['"]pdf_review['"]\)/)
  assert.match(panel, /handleQueueFilterChange\(['"]print_pending['"]\)/)
  assert.match(panel, /handleQueueFilterChange\(['"]completed['"]\)/)
  assert.doesNotMatch(panel, /onClick=\{\(\) => void releaseJob\(true\)\}/)
  // Admin V3: the queue is the calm main view; selecting a job opens the review as a
  // single-active modal that can be suspended (max 3 parked cards) or closed. Only the
  // center review-canvas expand is retained; per-rail collapse chevrons were removed.
  assert.match(panel, /const \[reviewFocus, setReviewFocus\] = useState\(false\)/)
  assert.match(panel, /const \[isReviewOpen, setIsReviewOpen\] = useState\(false\)/)
  assert.match(panel, /const showStage = !reviewFocus/)
  assert.match(panel, /reviewFocus \? 'Exit expanded review canvas' : 'Expand review canvas'/)
  assert.match(panel, /function GlassEdgeButton/)
  // Review is modal-gated on a selected job; the queue drives it via openReview.
  assert.match(panel, /isReviewOpen && selectedJob \?/)
  assert.match(panel, /onSelectJob=\{openReview\}/)
  assert.match(panel, /onClick=\{suspendReview\}/)
  assert.match(panel, /onClick=\{closeReview\}/)
  // Suspended parked reviews are capped at three; the fourth attempt is blocked with
  // a notice (never a silent eviction) until the user frees a slot.
  assert.match(panel, /const SUSPEND_LIMIT = 3/)
  assert.match(panel, /suspended\.length >= SUSPEND_LIMIT/)
  assert.match(panel, /Maximum of \$\{SUSPEND_LIMIT\} suspended previews reached/)
  assert.match(panel, /suspendNotice/)
  assert.doesNotMatch(panel, /const showQueue = /)
  assert.doesNotMatch(panel, /overviewOpen|queueOpen|stageOpen/)
  assert.doesNotMatch(panel, /Collapse queue overview|Collapse Job Queue|Collapse Release Stages/)
  assert.match(panel, /admin-review-scrollbar/)
  assert.match(globals, /\.admin-review-scrollbar::\-webkit-scrollbar-thumb/)
  assert.doesNotMatch(panel, /onWheel|onScroll=/)
  // Mobile stays a horizontal carousel; desktop is a vertical rail (legacy) or a
  // responsive board grid (full-width main view) selected by the variant prop.
  assert.match(jobQueue, /overflow-x-auto/)
  assert.match(jobQueue, /xl:block xl:space-y-3 xl:overflow-visible/)
  assert.match(jobQueue, /xl:grid xl:grid-cols-2 2xl:grid-cols-3/)
  assert.match(jobQueue, /variant\?: 'rail' \| 'board'/)
  assert.match(jobQueue, /w-\[min\(18rem,84vw\)\] shrink-0[^"]*xl:w-full/)
  assert.match(statCard, /<button/)
  assert.match(statCard, /aria-pressed=\{active\}/)
  assert.match(finalsPage, /<AdminPageHeader eyebrow="Review" title="Final Review" \/>/)
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

test('Service Control owns only the live Customize access control', async () => {
  const section = await read('components/admin/sections/ServiceControlSection.tsx')
  const customizeControl = await read(
    'components/admin/sections/service/CustomizeAccessControl.tsx'
  )
  const customizeApi = await read('app/api/admin/customize-access/route.ts')

  assert.match(section, /<CustomizeAccessControl\s*\/>/)
  assert.doesNotMatch(section, /CreatorPromo/)
  assert.match(customizeControl, /requestIntentRef/)
  assert.match(customizeControl, /setSettings\(previous\)/)
  assert.match(customizeApi, /failOnError:\s*true/)
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

test('Orders keeps production linkage read-only while supporting exact Final Review navigation', async () => {
  const section = await read('components/admin/sections/OrdersManagementSection.tsx')
  const card = await read('components/admin/sections/orders/OrderManagementCard.tsx')
  const snapshot = await read('components/admin/sections/orders/OrderProductionSnapshot.tsx')
  const linkedOrdersButton = await read('components/admin/final-review/LinkedOrdersButton.tsx')
  const floatingDialog = await read('components/admin/AdminFloatingDialog.tsx')
  const anchoredPopover = await read('components/admin/AdminAnchoredPopover.tsx')
  const finalsPage = await read('app/admin/(protected)/finals/page.tsx')
  const finalReviewPanel = await read('components/admin/FinalReviewPanel.tsx')
  const snapshotApi = await read('app/api/admin/orders/[orderId]/production/route.ts')
  const linkedOrdersApi = await read('app/api/admin/final-jobs/[finalJobId]/linked-orders/route.ts')
  const ordersApi = await read('app/api/admin/orders/route.ts')
  const readModel = await read('src/lib/admin-orders.ts')

  assert.match(section, /useState<OrderGroup>\(['"]active['"]\)/)
  assert.match(section, /Search order, customer, or email/)
  assert.match(section, /filtersOpen/)
  assert.match(section, /Load more/)
  assert.match(section, /expandedOrderId/)
  assert.match(section, /focusedOrderId/)
  assert.match(card, /production_progress/)
  assert.match(card, /OrderProductionSnapshot/)
  assert.match(card, /AdminFloatingDialog/)
  assert.match(card, /backdrop="blur"/)
  assert.match(card, /placement="center"/)
  assert.match(card, /productionSnapshotMode/)
  assert.match(card, /aria-expanded=\{expanded\}/)
  assert.match(card, /admin-v2-order-bubble/)
  assert.match(snapshot, /\/admin\/finals\?job=/)
  assert.match(snapshot, /&version=\$\{mode\}/)
  assert.match(snapshot, /mode:\s*['"]pdf['"]\s*\|\s*['"]print['"]/)
  assert.match(snapshot, /AdminFloatingDialog/)
  assert.doesNotMatch(snapshot, /approve-all-pages|release-print|upload-replacement|method:\s*['"](?:POST|PATCH|DELETE)['"]/)
  assert.match(snapshotApi, /\.from\(['"]cart_items['"]\)/)
  assert.match(snapshotApi, /\.from\(['"]final_job_pages['"]\)/)
  assert.match(snapshotApi, /createSignedUrls/)
  assert.doesNotMatch(snapshotApi, /\.update\(|\.insert\(|\.delete\(/)
  assert.match(linkedOrdersApi, /\.from\(['"]final_jobs['"]\)/)
  assert.match(linkedOrdersApi, /\.select\(['"]job_id['"]\)/)
  assert.match(linkedOrdersApi, /\.eq\(['"]final_job_id['"],\s*finalJob\.job_id\)/)
  assert.match(linkedOrdersApi, /\.from\(['"]cart_items['"]\)/)
  assert.match(linkedOrdersButton, /AdminAnchoredPopover/)
  assert.match(linkedOrdersButton, /admin-v2-glass-card/)
  assert.match(anchoredPopover, /createPortal/)
  assert.match(anchoredPopover, /getBoundingClientRect/)
  assert.match(floatingDialog, /createPortal/)
  assert.match(floatingDialog, /admin-v2-floating-layer fixed inset-0/)
  assert.match(floatingDialog, /admin-v2-floating-dialog pointer-events-auto/)
  assert.match(floatingDialog, /window\.getComputedStyle\(source\)/)
  assert.doesNotMatch(floatingDialog, /className=\{`ymi-admin-theme/)
  assert.match(floatingDialog, /aria-modal=\{backdrop === ['"]blur['"]/)
  assert.match(finalsPage, /requestedVersion === ['"]print['"] \? ['"]print['"] : ['"]pdf['"]/)
  assert.match(finalReviewPanel, /useState<ReviewVersion>\(initialVersion\)/)
  assert.match(ordersApi, /select\(ORDER_SELECT, \{ count: ['"]exact['"] \}\)/)
  assert.match(ordersApi, /\.range\(rangeStart, rangeEnd\)/)
  assert.match(ordersApi, /\.select\(['"]cart_item_id, order_id, final_job_id, product_type, package_type, quantity['"]\)/)
  assert.match(ordersApi, /aggregateAdminOrderProgress/)
  assert.match(ordersApi, /\.in\(['"]job_id['"],\s*Array\.from\(linkedGenerationJobIds\)\)/)
  assert.match(snapshotApi, /\.in\(['"]job_id['"],\s*linkedGenerationJobIds\)/)
  assert.match(readModel, /ADMIN_ORDER_VIEW_STATUSES/)
  assert.match(readModel, /isFinalJobReleased/)
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

test('Admin V2 collection pages share presentation primitives without merging state owners', async () => {
  const [ui, ordersPage, discountsPage, emailsPage, servicePage, orders, discounts, emails, service] =
    await Promise.all([
      read('components/admin/AdminUi.tsx'),
      read('app/admin/(protected)/orders/page.tsx'),
      read('app/admin/(protected)/discounts/page.tsx'),
      read('app/admin/(protected)/emails/page.tsx'),
      read('app/admin/(protected)/service/page.tsx'),
      read('components/admin/sections/OrdersManagementSection.tsx'),
      read('components/admin/sections/DiscountManagementSection.tsx'),
      read('components/admin/sections/emails/EmailEventsPanel.tsx'),
      read('components/admin/sections/ServiceControlSection.tsx'),
    ])

  for (const page of [ordersPage, discountsPage, emailsPage, servicePage]) {
    assert.match(page, /AdminPage/)
    assert.match(page, /AdminPageHeader/)
    assert.doesNotMatch(page, /h-dvh|h-screen|calc\(100(?:d)?vh/)
  }

  assert.match(ui, /AdminPanel/)
  assert.match(ui, /AdminButton/)
  assert.match(ui, /AdminStatusBadge/)
  assert.match(ui, /AdminNotice/)
  assert.match(ui, /AdminEmptyState/)
  assert.match(orders, /listRequestIntentRef/)
  assert.match(discounts, /listRequestIntentRef/)
  assert.match(emails, /isBrowserTranslated\(\)/)
  assert.match(service, /CustomizeAccessControl/)
  assert.doesNotMatch(service, /CreatorPromoControl/)
})

test('Admin V2 publishing workspaces share presentation primitives without changing publishing owners', async () => {
  const [
    ui,
    legalPage,
    announcementsPage,
    legalSection,
    legalEditor,
    legalHistory,
    announcements,
    announcementWorkspace,
  ] = await Promise.all([
    read('components/admin/AdminUi.tsx'),
    read('app/admin/(protected)/legal/page.tsx'),
    read('app/admin/(protected)/announcements/page.tsx'),
    read('components/admin/sections/LegalContentSection.tsx'),
    read('components/admin/legal/LegalDocumentEditor.tsx'),
    read('components/admin/legal/LegalRevisionHistory.tsx'),
    read('components/admin/sections/AnnouncementsSection.tsx'),
    read('components/admin/sections/announcements/AnnouncementWorkspace.tsx'),
  ])

  for (const page of [legalPage, announcementsPage]) {
    assert.match(page, /AdminPage/)
    assert.match(page, /AdminPageHeader/)
    assert.doesNotMatch(page, /h-dvh|h-screen|calc\(100(?:d)?vh/)
  }

  assert.doesNotMatch(ui, /useState|useEffect|fetch\(/)
  assert.match(legalSection, /listRequestIntentRef/)
  assert.match(legalSection, /detailRequestIntentRef/)
  assert.match(legalEditor, /expectedDraftVersion/)
  assert.match(legalEditor, /basePublishedRevisionId/)
  assert.match(legalHistory, /expectedCurrentPublishedRevisionId/)
  assert.match(announcements, /listRequestIntentRef/)
  assert.match(announcementWorkspace, /saveRequestIntentRef/)
  assert.match(announcementWorkspace, /uploadRequestIntentRef/)
  assert.match(announcementWorkspace, /uploadToSignedUrl/)
  assert.doesNotMatch(announcementWorkspace, /h-dvh|h-screen|calc\(100(?:d)?vh/)
})

test('Admin V2 Final Review keeps the T3-026 workspace while preserving the release controller', async () => {
  const [finalsPage, panel, queue, stage, pdfReview, printReview, globals] =
    await Promise.all([
      read('app/admin/(protected)/finals/page.tsx'),
      read('components/admin/FinalReviewPanel.tsx'),
      read('components/admin/final-review/JobQueue.tsx'),
      read('components/admin/final-review/FinalReviewStage.tsx'),
      read('components/admin/final-review/PdfVersionReview.tsx'),
      read('components/admin/final-review/PrintVersionReview.tsx'),
      read('app/globals.css'),
    ])

  assert.match(finalsPage, /AdminPage/)
  assert.match(finalsPage, /xl:h-full[^\n]*xl:min-h-0/)
  assert.match(panel, /admin-v2-panel/)
  assert.match(panel, /admin-v2-review-canvas/)
  assert.match(queue, /admin-v2-job-bubble/)
  assert.doesNotMatch(queue, /<aside className="admin-v2-panel/)
  assert.match(stage, /AdminPanel/)
  assert.match(stage, /AdminButton/)
  assert.match(globals, /\.admin-v2-review-canvas/)
  // Single-scroll-owner contract: no nested viewport canvas in the Final Review page/panel.
  // (Admin V3 redesign intentionally uses larger radii + warm gradient surfaces via tokens.)
  assert.doesNotMatch(
    finalsPage + panel + queue + stage + pdfReview + printReview,
    /h-dvh|h-screen|calc\(100(?:d)?vh/
  )

  assert.match(panel, /jobsRequestIntentRef/)
  assert.match(panel, /detailRequestIntentRef/)
  assert.match(panel, /signedUrlRequestIntentRef/)
  assert.match(panel, /reviewIntentRef/)
  assert.match(panel, /uploadToSignedUrl/)
  assert.match(panel, /expectedArtifactId/)
  assert.match(panel, /onReleasePdf=\{\(\) => void releaseJob\(\)\}/)
  assert.match(panel, /onReleasePrint=\{\(\) => void releasePrintVersion\(\)\}/)
  assert.doesNotMatch(panel, /approve-all-release|approveAll\s*\?|releaseJob\(true\)/)
})

test('Admin V2 responsive and accessibility closure preserves keyboard and narrow-screen escape paths', async () => {
  const [
    a11y,
    sidebar,
    globals,
    announcements,
    legalEditor,
    finalReview,
    supportInbox,
    supportQueue,
    supportConversation,
    supportContext,
    generalInbox,
  ] = await Promise.all([
    read('components/admin/adminA11y.ts'),
    read('components/admin/AdminSidebar.tsx'),
    read('app/globals.css'),
    read('components/admin/sections/AnnouncementsSection.tsx'),
    read('components/admin/legal/LegalDocumentEditor.tsx'),
    read('components/admin/FinalReviewPanel.tsx'),
    read('components/admin/sections/support/SupportInbox.tsx'),
    read('components/admin/sections/support/SupportTicketQueue.tsx'),
    read('components/admin/sections/support/SupportConversation.tsx'),
    read('components/admin/sections/support/SupportCustomerContext.tsx'),
    read('components/admin/sections/inbox/GeneralInbox.tsx'),
  ])

  assert.match(a11y, /ArrowLeft/)
  assert.match(a11y, /ArrowRight/)
  assert.match(a11y, /Home/)
  assert.match(a11y, /End/)
  assert.match(a11y, /tabs\[nextIndex\]\?\.focus\(\)/)
  assert.match(a11y, /tabs\[nextIndex\]\?\.click\(\)/)

  assert.match(sidebar, /event\.key === ['"]Escape['"]/)
  assert.match(sidebar, /event\.key !== ['"]Tab['"]/)
  assert.match(sidebar, /aria-modal="true"/)
  assert.match(sidebar, /mobileCloseRef\.current\?\.focus\(\)/)
  assert.match(sidebar, /mobileTrigger\?\.focus\(\)/)
  assert.match(sidebar, /document\.body\.style\.overflow = ['"]hidden['"]/)

  for (const tabs of [announcements, legalEditor, finalReview, supportQueue, generalInbox]) {
    assert.match(tabs, /role="tablist"/)
    assert.match(tabs, /role="tab"/)
    assert.match(tabs, /aria-selected=/)
    assert.match(tabs, /aria-controls=/)
    assert.match(tabs, /tabIndex=/)
    assert.match(tabs, /handleAdminTabKeyDown/)
  }

  assert.match(globals, /prefers-reduced-motion:\s*reduce/)
  assert.match(globals, /min-height:\s*2\.75rem\s*!important/)
  assert.match(globals, /\[role='tab'\]:focus-visible/)

  assert.match(supportInbox, /2xl:flex 2xl:h-full/)
  assert.match(supportQueue, /2xl:w-\[22rem\]/)
  assert.match(supportConversation, /2xl:hidden/g)
  assert.match(supportContext, /2xl:w-72/)
  assert.match(generalInbox, /2xl:w-\[22rem\]/)
  assert.match(generalInbox, /2xl:hidden/)
})

test('Admin typography, glass cards, and communication views share one presentation contract', async () => {
  const [globals, adminUi, jobQueue, emailThread, supportConversation, generalInbox, kolDetail, kolConversation] = await Promise.all([
    read('app/globals.css'),
    read('components/admin/AdminUi.tsx'),
    read('components/admin/final-review/JobQueue.tsx'),
    read('components/admin/email/AdminEmailThread.tsx'),
    read('components/admin/sections/support/SupportConversation.tsx'),
    read('components/admin/sections/inbox/GeneralInbox.tsx'),
    read('components/admin/sections/kol/KolLeadDetail.tsx'),
    read('components/admin/sections/kol/KolPartnershipConversation.tsx'),
  ])

  assert.match(globals, /\.ymi-admin-theme \*[\s\S]*letter-spacing:\s*0\s*!important/)
  assert.doesNotMatch(adminUi, /adminLabelClass[\s\S]{0,120}tracking-|adminLabelClass[\s\S]{0,120}uppercase/)
  assert.match(globals, /\.admin-v2-glass-card\s*\{/)
  assert.match(globals, /\.admin-v2-glass-card--selected\s*\{/)
  assert.match(globals, /\.admin-v2-message-card\s*\{/)
  assert.match(globals, /\.admin-v2-email-message--inbound\s*\{/)
  assert.match(globals, /\.admin-v2-email-message--outbound\s*\{/)
  assert.match(globals, /\.admin-v2-email-message--quarantine\s*\{/)
  assert.match(jobQueue, /admin-v2-job-bubble admin-v2-job-bubble--interactive/)
  assert.match(jobQueue, /admin-v2-job-bubble--selected/)

  for (const conversation of [supportConversation, generalInbox, kolConversation]) {
    assert.match(conversation, /AdminEmailMessageCard/)
    assert.match(conversation, /AdminEmailThread/)
    assert.match(conversation, /AdminEmailComposer/)
  }

  assert.match(emailThread, /data-email-direction=\{direction\}/)
  assert.match(emailThread, /admin-v2-email-message--\$\{direction\}/)
  assert.match(emailThread, /attachmentContent/)
  assert.match(emailThread, /deliveryError/)
  assert.doesNotMatch(emailThread, /fetch\(|useEffect|useState/)
  assert.match(supportConversation, /requestIdRef\.current/)
  assert.match(generalInbox, /\/api\/admin\/inbox\/messages\/\$\{selectedId\}\/replies/)
  assert.match(kolConversation, /quarantinedMessages\.map/)
  assert.match(kolConversation, /onReviewSender\(message\.message_id, 'confirm'\)/)
  assert.match(kolConversation, /onReviewSender\(message\.message_id, 'reject'\)/)

  assert.match(kolDetail, /type KolDetailView = 'conversation' \| 'application' \| 'partnership'/)
  assert.match(kolDetail, /role="tablist"/)
  assert.match(kolDetail, /handleAdminTabKeyDown/)
  assert.match(kolDetail, /hidden=\{activeView !== 'conversation'\}/)
  assert.match(kolDetail, /hidden=\{activeView !== 'application'\}/)
  assert.match(kolDetail, /hidden=\{activeView !== 'partnership'\}/)
  assert.equal((kolDetail.match(/<KolPartnershipConversation/g) || []).length, 1)
  assert.equal((kolDetail.match(/<KolPartnershipCodePanel/g) || []).length, 1)
})

test('Final Review queue renders independent warm glass job bubbles', async () => {
  const [globals, jobQueue] = await Promise.all([
    read('app/globals.css'),
    read('components/admin/final-review/JobQueue.tsx'),
  ])

  assert.match(globals, /\.admin-v2-job-bubble\s*\{[\s\S]*backdrop-filter:\s*blur\(22px\)/)
  assert.match(globals, /\.admin-v2-job-bubble--interactive:hover\s*\{[\s\S]*translateY\(-2px\)/)
  assert.match(globals, /\.admin-v2-job-bubble--selected\s*\{/)
  assert.match(jobQueue, /className="min-w-0 py-1"/)
  assert.doesNotMatch(jobQueue, /<aside className="admin-v2-panel/)
  assert.match(jobQueue, /admin-v2-job-bubble admin-v2-job-bubble--interactive/)
  assert.match(jobQueue, /admin-v2-job-bubble--selected/)
  assert.match(jobQueue, /Pages \{job\.approved_pages\}\/\{job\.total_pages\}/)
  assert.doesNotMatch(jobQueue, /<span>Print \{job\.print_status\}<\/span>/)
})

test('Admin workspaces keep instructional copy out of operational surfaces', async () => {
  const pagePaths = [
    'app/admin/(protected)/analytics/page.tsx',
    'app/admin/(protected)/announcements/page.tsx',
    'app/admin/(protected)/banner/page.tsx',
    'app/admin/(protected)/catalog/page.tsx',
    'app/admin/(protected)/discounts/page.tsx',
    'app/admin/(protected)/emails/page.tsx',
    'app/admin/(protected)/finals/page.tsx',
    'app/admin/(protected)/inbox/page.tsx',
    'app/admin/(protected)/legal/page.tsx',
    'app/admin/(protected)/orders/page.tsx',
    'app/admin/(protected)/partnerships/page.tsx',
    'app/admin/(protected)/service/page.tsx',
    'app/admin/(protected)/support/page.tsx',
  ]
  const [pages, stage, pdfReview, printReview] = await Promise.all([
    Promise.all(pagePaths.map(read)),
    read('components/admin/final-review/FinalReviewStage.tsx'),
    read('components/admin/final-review/PdfVersionReview.tsx'),
    read('components/admin/final-review/PrintVersionReview.tsx'),
  ])

  for (const page of pages) assert.doesNotMatch(page, /description=/)
  assert.doesNotMatch(stage, /description=|Customer-facing PDF approval|manually prepared, private printer PDF/)
  assert.doesNotMatch(printReview, /goes directly to private Storage|records the operational handoff|separate from the lower-resolution/)
  assert.match(pdfReview, /Upload missing pages before PDF Release/)
  assert.match(pdfReview, /page\.error_message/)
})

test('every protected Admin page owns one content title and the shell owns none', async () => {
  const pagePaths = [
    'app/admin/(protected)/analytics/page.tsx',
    'app/admin/(protected)/announcements/page.tsx',
    'app/admin/(protected)/banner/page.tsx',
    'app/admin/(protected)/catalog/page.tsx',
    'app/admin/(protected)/discounts/page.tsx',
    'app/admin/(protected)/emails/page.tsx',
    'app/admin/(protected)/finals/page.tsx',
    'app/admin/(protected)/inbox/page.tsx',
    'app/admin/(protected)/legal/page.tsx',
    'app/admin/(protected)/orders/page.tsx',
    'app/admin/(protected)/partnerships/page.tsx',
    'app/admin/(protected)/service/page.tsx',
    'app/admin/(protected)/support/page.tsx',
  ]
  const [pages, shell, sidebar, globals] = await Promise.all([
    Promise.all(pagePaths.map(read)),
    read('components/admin/AdminShell.tsx'),
    read('components/admin/AdminSidebar.tsx'),
    read('app/globals.css'),
  ])

  for (const page of pages) {
    assert.equal((page.match(/<AdminPageHeader\b/g) || []).length, 1)
  }
  assert.doesNotMatch(shell, /AdminCommandBar|YMI Operations/)
  assert.doesNotMatch(sidebar, /currentItem\?\.label|getAdminNavigationItem/)
  assert.doesNotMatch(globals, /\.admin-v2-commandbar\s*\{/)
})
