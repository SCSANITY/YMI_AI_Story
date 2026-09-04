import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('T4-025 removes the customer duration review without weakening capture security', async () => {
  const [recorder, signatureVoice, confirmRoute, migration] = await Promise.all([
    read('components/personalize/VoiceRecorderPanel.tsx'),
    read('src/lib/signature-voice.ts'),
    read('app/api/user-assets/confirm/route.ts'),
    read('tests/fixtures/external-contracts/sql/20260904_150000_t4_025_signature_voice_capture_review_removal.sql'),
  ])

  assert.match(recorder, /recorder\.onstop[\s\S]*new File\(\[blob\][\s\S]*onRecordingSelected\(\{ file, durationSeconds \}\)/)
  assert.doesNotMatch(recorder, /MIN_SECONDS|MAX_SECONDS|Use This Recording|canSaveRecording/)
  assert.match(signatureVoice, /Number\.isFinite\(durationSeconds\) && durationSeconds > 0/)
  assert.doesNotMatch(signatureVoice, /SIGNATURE_VOICE_(?:MIN|MAX)_SAMPLE_SECONDS/)

  assert.match(confirmRoute, /validateStoredUserAssetMetadata/)
  assert.match(confirmRoute, /\.from\('raw-private'\)[\s\S]*\.download\(storagePath\)/)
  assert.match(confirmRoute, /parseBuffer\(bytes/)
  assert.match(confirmRoute, /isVerifiedSignatureVoiceDuration\(duration\)/)
  assert.match(confirmRoute, /confirm_signature_voice_capture/)

  assert.match(migration, /alter column voice_sample_duration_seconds type numeric/)
  assert.match(migration, /voice_sample_duration_seconds > 0/)
  assert.match(migration, /v_voice_duration is null or v_voice_duration <= 0/)
  assert.match(migration, /p_voice_sample_duration_seconds <= 0/)
  assert.doesNotMatch(
    migration.slice(migration.indexOf('alter table public.creations\n  drop constraint')),
    /not between 10 and 20|between 10 and 20/,
  )
  assert.match(migration, /security definer[\s\S]*set search_path = ''/)
  assert.match(migration, /grant execute on function public\.create_preview_job[\s\S]*to service_role/)
})

