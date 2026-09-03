import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import test from 'node:test'

const projectRoot = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, projectRoot), 'utf8')

function sourceFiles(directory) {
  return readdirSync(new URL(directory, projectRoot), { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? sourceFiles(path) : [path]
    })
    .filter((path) => ['.ts', '.tsx'].includes(extname(path)))
}

test('decorative tracking stays within the shared readable range', () => {
  const oversizedTracking = []

  for (const path of [...sourceFiles('app'), ...sourceFiles('components')]) {
    const source = read(path)
    for (const match of source.matchAll(/tracking-\[(-?\d+(?:\.\d+)?)em\]/g)) {
      const tracking = Number(match[1])
      if (tracking <= 0.14) continue

      const isVerificationCodeSpacing =
        relative('.', path).replaceAll('\\', '/') === 'components/LoginModal.tsx'
        && tracking === 0.3

      if (!isVerificationCodeSpacing) oversizedTracking.push(`${path}: ${match[0]}`)
    }
  }

  assert.deepEqual(oversizedTracking, [])
})

test('display typography leaves weight ownership to each component', () => {
  const globals = read('app/globals.css')
  const displayRule = globals.match(/\.font-display\s*\{([\s\S]*?)\}/)?.[1] ?? ''

  assert.match(displayRule, /font-family:\s*var\(--font-playfair\)/)
  assert.match(displayRule, /letter-spacing:\s*-0\.012em/)
  assert.doesNotMatch(displayRule, /font-weight:/)
})

test('compact catalog and navbar labels remain readable without collisions', () => {
  const bookList = read('components/BookList.tsx')
  const navbar = read('components/Navbar.tsx')

  assert.match(bookList, /\{active \? \([\s\S]*?\{selectedLabel\}[\s\S]*?\) : null\}/)
  assert.match(bookList, /truncate text-\[11px\] font-bold uppercase tracking-\[0\.04em\]/)
  assert.match(navbar, /shrink-0 whitespace-nowrap px-3 sm:px-4/)
  assert.match(navbar, /pathname !== '\/' \? 'max-\[340px\]:hidden' : ''/)
})
