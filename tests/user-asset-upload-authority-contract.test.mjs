import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('signed user uploads declare size and are rate limited by owner and IP', () => {
  const client = read('src/services/assets.ts')
  const route = read('app/api/upload-url/route.ts')
  const sql = read('../Template_folder/sql_user_asset_upload_rate_limits.sql')

  assert.match(client, /size_bytes:\s*uploadFile\.size/)
  assert.match(route, /validateUserAssetUpload\(\{ assetType, contentType, sizeBytes \}\)/)
  assert.match(route, /consume_user_asset_upload_rate_limit/)
  assert.match(route, /p_owner_key/)
  assert.match(route, /p_ip_key/)
  assert.match(sql, /cardinality\(v_owner_times\) >= 12/)
  assert.match(sql, /cardinality\(v_ip_times\) >= 30/)
  assert.match(sql, /revoke all on table .* from public, anon, authenticated/i)
})

test('both immediate and deferred confirmation inspect actual Storage metadata', () => {
  const confirmRoute = read('app/api/user-assets/confirm/route.ts')
  const deferredServer = read('src/lib/face-assets-server.ts')

  for (const source of [confirmRoute, deferredServer]) {
    assert.match(source, /\.info\(/)
    assert.match(source, /validateStoredUserAssetMetadata/)
    assert.match(source, /\.remove\(/)
  }
})
