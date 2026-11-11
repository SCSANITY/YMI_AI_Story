// Credential-free local production-build fixture. Serves synthetic catalog and
// read-only photo history; all upload/job writes are blocked by this harness.
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const host = '127.0.0.1'
const fixturePort = Number(process.argv[2] ?? 4394)
const nextPort = Number(process.argv[3] ?? 4395)
const origin = `http://${host}:${fixturePort}`
const book = {
  template_id: 'Fixture_story', name: 'Local photo check', description: 'Synthetic fixture for the photo preparation review.',
  is_active: true, age_group: '3-6', catalog_display_package_type: 'basic',
  cover_image_path: origin + '/fixture/cover.webp',
  package_prices: ['basic', 'supreme'].map((package_type, i) => ({
    package_type, list_price_usd: 39 + i * 20, sale_price_usd: null,
    display_discount_percent: null, row_version: 1, updated_at: '2026-11-11T00:00:00Z',
  })),
  home_placements: [],
}
const assetId = '40000000-0000-4000-8000-000000000002'
const fixtureImage = await readFile(path.join(root, 'public/personalize-photo-samples/optimized/good-01.webp'))
const env = {}
for (const key of Object.keys(process.env)) {
  if (/^(path|systemroot|windir|comspec|pathext|temp|tmp|userprofile|appdata|localappdata)$/i.test(key)) env[key] = process.env[key]
}
Object.assign(env, {
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SUPABASE_URL: origin,
  SUPABASE_URL: origin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-fixture-not-a-credential',
  SUPABASE_SECRET_KEY: 'sb_secret_local_fixture_not_a_credential',
})
const json = (res, value, status = 200) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value))
let child
const fixture = createServer((req, res) => {
  const url = new URL(req.url, origin)
  const route = url.pathname
  if (req.headers.host !== `${host}:${fixturePort}`) return res.writeHead(403).end()
  if (route === '/rest/v1/templates') return json(res, req.headers.accept?.includes('vnd.pgrst.object') ? book : [book])
  if (route.startsWith('/rest/v1/') || route.startsWith('/storage/v1/object/list/')) return json(res, [])
  if (route === '/auth/v1/user') return json(res, {}, 401)
  if (route === '/fixture/cover.webp' || route === '/fixture/saved-photo.webp' ||
      (route === '/_next/image' && url.searchParams.get('url') === book.cover_image_path)) {
    return res.writeHead(200, { 'Content-Type': 'image/webp' }).end(fixtureImage)
  }
  if (route === '/api/customize-access') return json(res, { open: true, enabled: true, allowed: true })
  if (route === '/api/user-assets' && req.method === 'GET') return json(res, {
    faces: [{ asset_id: assetId, signed_url: origin + '/fixture/saved-photo.webp', storage_path: 'fixture/photo.webp' }],
    profiles: [], voices: [],
  })
  if (!['GET', 'HEAD'].includes(req.method)) {
    // This also makes an accidental Generate click safe during local review.
    return json(res, { error: 'Writes are disabled in the local photo review fixture.' }, 405)
  }
  const upstream = request({ hostname: host, port: nextPort, path: req.url, method: req.method,
    headers: { ...req.headers, host: `${host}:${nextPort}` } }, next => {
    res.writeHead(next.statusCode, next.headers)
    next.pipe(res)
  })
  upstream.on('error', () => json(res, { error: 'Local build is not ready' }, 503))
  upstream.end()
})

function runNext(args) {
  return new Promise((resolve, reject) => {
    child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), ...args],
      { cwd: root, env, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', code => resolve(code ?? 1))
  })
}
process.on('SIGINT', () => { child?.kill(); fixture.close(() => process.exit(0)) })
await new Promise(resolve => fixture.listen(fixturePort, host, resolve))
if (!process.argv.includes('--start-only')) {
  const result = await runNext(['build'])
  if (result !== 0) { fixture.close(); process.exitCode = result }
}
if (!process.exitCode) {
  console.log(`LOCAL PHOTO CANDIDATE ${origin}/personalize/Fixture_story (writes disabled)`)
  process.exitCode = await runNext(['start', '--hostname', host, '--port', String(nextPort)])
  fixture.close()
}
