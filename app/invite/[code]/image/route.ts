import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { downloadStorageAsset } from '@/lib/storage-response'

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> | { code: string } }
) {
  const { code } = await Promise.resolve(context.params)
  const normalizedCode = String(code || '').trim().toUpperCase()

  if (!normalizedCode) {
    return NextResponse.json({ error: 'Missing invite code' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('referral_codes')
    .select('cover_bucket, cover_storage_path')
    .eq('code', normalizedCode)
    .maybeSingle()

  if (error || !data?.cover_storage_path) {
    return NextResponse.json({ error: 'Invite image not found' }, { status: 404 })
  }

  try {
    return await downloadStorageAsset(data.cover_bucket || 'raw-private', data.cover_storage_path)
  } catch (downloadError: any) {
    return NextResponse.json(
      { error: downloadError?.message || 'Failed to load invite image' },
      { status: 500 }
    )
  }
}
