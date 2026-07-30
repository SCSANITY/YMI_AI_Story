import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('the rewards dialog renders above page and navbar stacking contexts', async () => {
  const source = await readFile(path.join(root, 'components/MyRewardsModal.tsx'), 'utf8')

  assert.match(source, /import\s+\{\s*createPortal\s*\}\s+from\s+['"]react-dom['"]/)
  assert.match(source, /return createPortal\(/)
  assert.match(source, /document\.body/)
  assert.match(source, /z-\[180\]/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.doesNotMatch(source, /bg-slate-950\/28/)
})
