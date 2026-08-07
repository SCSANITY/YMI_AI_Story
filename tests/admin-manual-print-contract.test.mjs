import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const appRoot = new URL('../', import.meta.url)
const sqlUrl = new URL('../../Template_folder/sql_final_print_artifacts.sql', import.meta.url)

async function read(path) {
  return readFile(new URL(path, appRoot), 'utf8')
}

test('manual print SQL owns immutable revisions and atomic commit/release locks', async () => {
  const sql = await readFile(sqlUrl, 'utf8')

  assert.match(sql, /create table if not exists public\.final_print_artifacts/)
  assert.match(sql, /storage_path text not null unique/)
  assert.match(sql, /declared_size_bytes > 0 and declared_size_bytes <= 262144000/)
  assert.match(sql, /create_final_print_artifact/)
  assert.match(sql, /commit_final_print_artifact/)
  assert.match(sql, /release_final_print_artifact/)
  assert.match(sql, /where artifact\.artifact_id = p_artifact_id/)
  assert.match(sql, /where artifact\.artifact_id = v_job\.print_package_artifact_id/)
  assert.doesNotMatch(sql, /where artifact_id = (?:p_artifact_id|v_job\.print_package_artifact_id)/)
  assert.match(sql, /from public\.final_jobs[\s\S]*for update/)
  assert.match(sql, /print_package_artifact_id = p_artifact_id/)
  assert.match(sql, /status = 'superseded'/)
  assert.match(sql, /status = 'released'/)
  assert.match(sql, /print_package_artifact_id is distinct from p_expected_artifact_id/)
  assert.match(sql, /grant execute on function public\.release_final_print_artifact[\s\S]*to service_role/)
  assert.doesNotMatch(sql, /update public\.orders|send.*email|worker/i)
})

test('Admin upload is direct-to-Storage and server confirmation verifies bytes before commit', async () => {
  const [panel, uploadUrl, confirm, policy] = await Promise.all([
    read('components/admin/FinalReviewPanel.tsx'),
    read('app/api/admin/final-jobs/[finalJobId]/print-package/upload-url/route.ts'),
    read('app/api/admin/final-jobs/[finalJobId]/print-package/confirm/route.ts'),
    read('src/lib/manual-print-artifact.ts'),
  ])

  assert.match(uploadUrl, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(uploadUrl, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/)
  assert.match(uploadUrl, /create_final_print_artifact/)
  assert.doesNotMatch(uploadUrl, /arrayBuffer|\.upload\(/)
  assert.match(panel, /uploadToSignedUrl\(uploadSpec\.storagePath, uploadSpec\.token, file/)
  assert.match(panel, /print-package\/confirm/)

  assert.match(confirm, /\.info\(row\.storage_path\)/)
  assert.match(confirm, /verifyRemotePdfHeader/)
  assert.match(confirm, /commit_final_print_artifact/)
  assert.match(policy, /MANUAL_PRINT_PDF_MAX_BYTES = 250 \* 1024 \* 1024/)
  assert.match(policy, /PDF_HEADER = ['"]%PDF-['"]/)
  assert.match(policy, /Range:\s*['"]bytes=0-4['"]/)
  assert.match(policy, /MANUAL_PRINT_PDF_HEADER_TIMEOUT_MS = 12_000/)
  assert.match(policy, /MANUAL_PRINT_PDF_HEADER_ATTEMPTS = 2/)
})

test('Print Release locks only the verified manual artifact', async () => {
  const [releaseRoute, panel, printReview] = await Promise.all([
    read('app/api/admin/final-jobs/[finalJobId]/release-print/route.ts'),
    read('components/admin/FinalReviewPanel.tsx'),
    read('components/admin/final-review/PrintVersionReview.tsx'),
  ])

  assert.match(releaseRoute, /release_final_print_artifact/)
  assert.match(releaseRoute, /p_expected_artifact_id:\s*body\.expectedArtifactId/)
  assert.match(panel, /body:\s*JSON\.stringify\(\{ expectedArtifactId \}\)/)
  assert.doesNotMatch(releaseRoute, /\.from\(['"]orders['"]\)|sendOrder|sendEmail|jobs|Worker/)
  assert.doesNotMatch(panel, /upload-print-page|print_completed_pages\s*>?=/)
  assert.doesNotMatch(printReview, /final_job_pages|buildFinalReviewWorkspace|fetch\s*\(/)
  assert.match(printReview, /separate from the lower-resolution customer viewing PDF/)
  assert.match(printReview, /does not rebuild the file, run the Worker, replace the customer PDF, or send another customer email/)
  await assert.rejects(
    access(new URL('app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-print-page/route.ts', appRoot))
  )
  await assert.rejects(access(new URL('components/admin/final-review/PrintPageDialog.tsx', appRoot)))
})
