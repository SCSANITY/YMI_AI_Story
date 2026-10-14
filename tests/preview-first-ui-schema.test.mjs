import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const { build } = require('esbuild')

async function component(entry, name) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(`../${entry}`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
    external: ['react', 'react/jsx-runtime', 'lucide-react'] })
  const loaded = { exports: {} }
  runInNewContext(result.outputFiles[0].text, { module: loaded, exports: loaded.exports, require,
    console, URL, fetch: () => assert.fail('UI proof fetched data'), setTimeout, clearTimeout })
  return loaded.exports[name]
}

test('actual Admin queue renders production mode separately from review progress', async () => {
  const Queue = await component('components/admin/final-review/JobQueue.tsx', 'JobQueue')
  const html = renderToStaticMarkup(React.createElement(Queue, {
    jobs: [{ final_job_id: 'review', order_id: 'order', display_title: 'Synthetic book', production_mode: 'manual',
      review_status: 'pending', print_status: 'locked', total_pages: 31, approved_pages: 0 }],
    totalJobs: 1, selectedJobId: 'review', loadingJobs: false, emptyLabel: 'None', onSelectJob: () => {},
  }))
  assert.match(html, /Handmade/)
  assert.doesNotMatch(html, /Production: Manual/)
  assert.match(html, /PDF pending/)
  const modal = await readFile(new URL('../components/admin/FinalReviewPanel.tsx', import.meta.url), 'utf8')
  assert.match(modal, /selectedJob\.production_mode === 'manual' \? 'Handmade' : 'Auto'/)
})

test('actual PDF workspace keeps Rerun visible but disabled only for manual production', async () => {
  const Review = await component('components/admin/final-review/PdfVersionReview.tsx', 'PdfVersionReview')
  const page = { final_job_page_id: 'page', page_index: 10, output_order: 0, role: 'final_front_cover',
    spread_index: 0, side: null, page_number: null, status: 'pending_review', has_ai_output: true,
    has_manual_output: false, has_approved_output: false, ai_url: 'https://synthetic.invalid/page.png' }
  const props = { pages: [page], pageContract: { schema_version: 3, asset_layout: 'single-page' },
    loadingDetail: false, reviewNote: '', setReviewNote: () => {}, busyAction: null,
    reviewPendingByPage: {}, uploadPendingByPage: {}, uploadErrorByPage: {},
    approvePage: async () => {}, markNeedsFix: async () => {}, rerunPage: async () => {},
    approveAllPages: async () => {}, exportApprovedSources: async () => {},
    openReplacementPicker: () => {}, onImageLoadError: () => {} }
  for (const productionMode of ['manual', 'auto']) {
    const html = renderToStaticMarkup(React.createElement(Review, { ...props,
      selectedJob: { production_mode: productionMode, status: 'review_pending' } }))
    const buttons = html.match(/<button[^>]*title="(?:Manual production uses uploaded pages|Rerun this automatic page)"[^>]*>/g) ?? []
    assert.ok(buttons.length > 0)
    for (const button of buttons) assert.equal(/\bdisabled(?:=|\s|>)/.test(button), productionMode === 'manual')
  }
})

test('proposed SQL retains original states and queue eligibility without business or security mutation', async () => {
  const sql = await readFile(new URL('./fixtures/external-contracts/sql/20261013_200000_preview_first_manual_final.sql', import.meta.url), 'utf8')
  assert.match(sql, /alter type public\.job_status add value if not exists 'manual_pending'/)
  assert.match(sql, /array\['queued','running','done','failed','cancel_requested','cancelled'\]/)
  for (const state of ['queued', 'processing', 'review_pending', 'needs_fix', 'releasing', 'completed', 'failed', 'pending_review', 'approved', 'rerunning', 'replaced']) {
    assert.ok(sql.includes(`'${state}'`))
  }
  assert.doesNotMatch(sql, /^\s*(?:insert|update|delete|truncate|grant|revoke|create\s+(?:or\s+replace\s+)?function)\b/im)
  assert.doesNotMatch(sql.slice(0, sql.indexOf('commit;')), /'manual_pending'::public\.job_status/)
  const claim = await readFile(new URL('./fixtures/external-contracts/sql/20260904_205500_wc_001_worker_orchestration.sql', import.meta.url), 'utf8')
  const body = claim.slice(claim.indexOf('create or replace function public.claim_next_job('), claim.indexOf('create or replace function public.renew_job_lease('))
  assert.match(body, /job_row\.status = 'queued'::public\.job_status/)
  assert.match(body, /job_row\.status = 'running'::public\.job_status/)
  assert.doesNotMatch(body, /manual_pending/)
})
