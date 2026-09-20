import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (relativePath) => readFile(new URL(relativePath, root), 'utf8')

test('Signature Voice uses one responsive portal without native-dialog navigation side effects', async () => {
  const dialog = await read('components/personalize/SignatureVoiceDialog.tsx')

  assert.match(dialog, /createPortal/)
  assert.match(dialog, /role="dialog"/)
  assert.match(dialog, /aria-modal="true"/)
  assert.match(dialog, /h-\[100dvh\]/)
  assert.match(dialog, /min-h-0 flex-1 overflow-y-auto overscroll-contain/)
  assert.match(dialog, /body\.style\.position = 'fixed'/)
  assert.match(dialog, /window\.scrollTo\(\{ top: scrollY, left: 0, behavior: 'auto' \}\)/)
  assert.match(dialog, /focus\(\{ preventScroll: true \}\)/)
  assert.doesNotMatch(dialog, /<dialog|showModal\(|\.close\(\)/)
})

test('pending voice capture survives a mobile modal close and recorder remount', async () => {
  const [dialog, recorder] = await Promise.all([
    read('components/personalize/SignatureVoiceDialog.tsx'),
    read('components/personalize/VoiceRecorderPanel.tsx'),
  ])

  assert.match(dialog, /pendingRecording=\{pendingRecording\}/)
  assert.match(recorder, /pendingRecording\?: PendingVoiceRecording \| null/)
  assert.match(recorder, /URL\.createObjectURL\(pendingRecording\.file\)/)
  assert.match(recorder, /setRecordedBlob\(pendingRecording\.file\)/)
  assert.match(recorder, /setSeconds\(pendingRecording\.durationSeconds\)/)
  assert.match(recorder, /setPhase\('selected'\)/)
})

test('voice authorization and upload/save callbacks remain explicit', async () => {
  const dialog = await read('components/personalize/SignatureVoiceDialog.tsx')

  assert.match(dialog, /const \[authorized, setAuthorized\] = useState\(false\)/)
  assert.match(dialog, /aria-required="true"/)
  assert.match(dialog, /disabled=\{!pendingRecording \|\| !authorized \|\| isSaving\}/)
  assert.match(dialog, /pendingRecording && onSave\(pendingRecording\)/)
})
