import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { build } from 'esbuild'

const fixture = fileURLToPath(new URL('./fixtures/final-review-materials-ui.jsx', import.meta.url))
const browser = process.env.CHROME_BIN || [
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(candidate => candidate && existsSync(candidate))

test('Orders and Final Review keep book links, delivery events, recordings and dedication scoped during navigation', {
  skip: browser ? false : 'Set CHROME_BIN to run the browser regression',
}, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ymi-final-materials-'))
  let server
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
    const fixtureJs = await readFile(path.join(dir, 'fixture.js'))
    const pixel = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'green' } }).webp().toBuffer()
    const downloads = []
    const completion = Promise.withResolvers()
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost')
      res.setHeader('cache-control', 'private, no-store')
      if (url.pathname === '/') {
        res.setHeader('content-type', 'text/html')
        res.end('<!doctype html><meta charset="utf-8"><div id="root"></div><pre id="result">pending</pre><script>const reportError=fetch.bind(window);onerror=(msg)=>{document.getElementById("result").textContent=encodeURIComponent(msg);reportError("/test-finished")}</script><script src="/fixture.js"></script><img hidden src="/wait-for-test">')
      } else if (url.pathname === '/wait-for-test') {
        // Let --dump-dom wait for real HTTP image loads and the completed React assertions.
        void completion.promise.then(() => res.writeHead(204).end())
      } else if (url.pathname === '/test-finished') {
        completion.resolve()
        res.writeHead(204).end()
      } else if (url.pathname === '/fixture.js') {
        res.setHeader('content-type', 'application/javascript')
        res.end(fixtureJs)
      } else if (url.searchParams.get('kind') === 'webp') {
        res.setHeader('content-type', 'image/webp')
        res.end(pixel)
      } else {
        if (url.searchParams.get('kind') === 'png') downloads.push(req.url)
        res.writeHead(404).end()
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const { stdout } = await promisify(execFile)(browser, [
      '--headless=new', '--disable-background-networking', '--no-first-run', '--disable-sync',
      '--user-data-dir=' + path.join(dir, 'profile'),
      '--dump-dom', 'http://127.0.0.1:' + server.address().port + '/',
    ], { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
    const result = stdout.match(/<pre id="result">([^<]*)<\/pre>/)?.[1]
    assert.equal(result, 'passed', decodeURIComponent(result ?? 'Browser result missing'))
    assert.deepEqual(downloads, [], 'Navigation must not request full PNG downloads')
  } finally {
    server?.closeAllConnections()
    if (server?.listening) await new Promise(resolve => server.close(resolve))
    await rm(dir, { recursive: true, force: true, maxRetries: 5 })
  }
})
