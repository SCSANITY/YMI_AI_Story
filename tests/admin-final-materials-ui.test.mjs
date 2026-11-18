import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'

const fixture = fileURLToPath(new URL('./fixtures/final-review-materials-ui.jsx', import.meta.url))
const browser = process.env.CHROME_BIN || [
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(candidate => candidate && existsSync(candidate))

test('Final Review tab switches keep one materials panel per book and show cleared copied dedications', {
  skip: browser ? false : 'Set CHROME_BIN to run the browser regression',
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ymi-final-materials-'))
  try {
    await build({
      entryPoints: [fixture], bundle: true, jsx: 'automatic', outfile: path.join(dir, 'fixture.js'),
      define: { 'process.env.NODE_ENV': '"development"' },
      plugins: [{
        name: 'isolated-supabase',
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'client', namespace: 'fixture' }))
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = {}' }))
        },
      }],
    })
    const page = path.join(dir, 'index.html')
    await writeFile(page, '<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="result">pending</pre><script src="fixture.js"></script>')
    const { stdout } = await promisify(execFile)(browser, [
      '--headless=new', '--disable-background-networking', '--no-first-run', '--disable-sync',
      '--user-data-dir=' + path.join(dir, 'profile'), '--virtual-time-budget=10000',
      '--dump-dom', pathToFileURL(page).href,
    ], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
    const result = stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]
    assert.equal(result, 'passed', decodeURIComponent(result ?? 'Browser result missing'))
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 })
  }
})
