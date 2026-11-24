import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

for (const [ownerType, column] of [['customer', 'customer_id'], ['anon', 'anon_session_id']]) {
  test(`saved-photo recovery requests only the exact ${ownerType}-owned face`, async () => {
    const filters = []
    const signed = []
    const assetId = '40000000-0000-4000-8000-000000000002'
    const client = {
      from(table) {
        assert.equal(table, 'user_assets')
        return {
          select() { return this },
          eq(field, value) { filters.push([field, value]); return this },
          limit(count) {
            assert.equal(count, 1)
            return { data: [{ asset_id: assetId, asset_type: 'face_image', storage_path: 'fixture/face' }] }
          },
        }
      },
      storage: { from(bucket) {
        assert.equal(bucket, 'raw-private')
        return { async createSignedUrl(path) {
          signed.push(path)
          return { data: { signedUrl: 'fixture-url' } }
        } }
      } },
    }
    const { GET } = loadUi('app/api/user-assets/route.ts', {
      'next/server': { NextResponse: Response },
      '@/lib/supabaseAdmin': { supabaseAdmin: client },
      '@/lib/checkout-owner': {
        resolveCheckoutOwner: async () => ({ ownerType }),
        ownerFilter: () => ({ owner_type: ownerType, column, value: 'test-owner' }),
      },
      '@/lib/userAssetsStorage': { USER_ASSET_SIGN_TTL_SECONDS: 60 },
      '@/lib/signature-voice': {},
    }, { URL })
    const get = value => GET(new Request('http://localhost/api/user-assets?faceAssetId=' + value))
    assert.equal((await get('invalid')).status, 400)
    assert.equal(filters.length, 0)
    const response = await (await get(assetId)).json()
    assert.deepEqual(filters, [['owner_type', ownerType], [column, 'test-owner'], ['asset_type', 'face_image'], ['asset_id', assetId]])
    assert.deepEqual(signed, ['fixture/face'])
    assert.equal(response.faces[0].signed_url, 'fixture-url')
  })
}
