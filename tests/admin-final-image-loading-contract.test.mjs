import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

async function read(path) {
  return readFile(new URL(path, root), 'utf8')
}

test('Admin Final thumbnails load near the viewport without a full-job warmup', async () => {
  const [panel, thumbnail] = await Promise.all([
    read('components/admin/FinalReviewPanel.tsx'),
    read('components/admin/final-review/thumbnail.tsx'),
  ])

  assert.doesNotMatch(panel, /warmAdminThumbnails/)
  assert.doesNotMatch(panel, /pdfItems\.slice|printItems/)
  assert.match(thumbnail, /IntersectionObserver/)
  assert.match(thumbnail, /rootMargin:\s*['"]240px 0px['"]/)
  assert.match(thumbnail, /const inFlightThumbs = new Map/)
  assert.match(thumbnail, /inFlightThumbs\.get\(cacheKey\)/)
  assert.match(thumbnail, /if\s*\(!enabled\s*\|\|\s*!sourceUrl\s*\|\|\s*!cacheKey\)/)
  assert.doesNotMatch(thumbnail, /warmAdminThumbnails/)
})

test('selected PDF images stay full-resolution while navigation uses local thumbnails', async () => {
  const [thumbnail, pdfReview, printReview] = await Promise.all([
    read('components/admin/final-review/thumbnail.tsx'),
    read('components/admin/final-review/PdfVersionReview.tsx'),
    read('components/admin/final-review/PrintVersionReview.tsx'),
  ])

  assert.match(thumbnail, /export function FullResolutionImage/)
  assert.match(thumbnail, /fetchPriority="high"/)
  assert.match(pdfReview, /<FullResolutionImage/)
  assert.match(pdfReview, /function StructuredPageNavigatorButton[\s\S]*<ThumbnailImage/)
  assert.doesNotMatch(printReview, /ThumbnailImage|FullResolutionImage/)

  const sources = thumbnail + pdfReview + printReview
  assert.doesNotMatch(sources, /next\/image|_next\/image/)
})

test('Admin Final detail batches private signed URLs without exposing paths', async () => {
  const detailRoute = await read('app/api/admin/final-jobs/[finalJobId]/route.ts')

  assert.match(detailRoute, /\.createSignedUrls\(uniquePaths,\s*SIGN_TTL_SECONDS\)/)
  assert.doesNotMatch(detailRoute, /\.createSignedUrl\(/)
  assert.match(detailRoute, /signedUrlByPath\.get\(source\.approved_output_path\)/)
  assert.match(detailRoute, /jsonNoStore/)
})
