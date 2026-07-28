import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('the public product theme stays explicitly light until a complete dark theme exists', async () => {
  const globals = await read('app/globals.css')
  const layout = await read('app/layout.tsx')
  const notFound = await read('app/not-found.tsx')

  assert.match(globals, /:root\s*\{[^}]*color-scheme:\s*only light;/s)
  assert.match(globals, /html\s*\{[^}]*background:\s*var\(--background\);/s)
  assert.doesNotMatch(globals, /prefers-color-scheme:\s*dark/)
  assert.match(layout, /colorScheme:\s*['"]light['"]/)
  assert.match(layout, /themeColor:\s*['"]#ffffff['"]/)
  assert.match(layout, /<body className="[^"]*bg-white[^"]*text-gray-900/)
  assert.match(notFound, /page-surface/)
  assert.match(notFound, /text-gray-900/)
  assert.doesNotMatch(notFound, /prefers-color-scheme|dark:/)
})
