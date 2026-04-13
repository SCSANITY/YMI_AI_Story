import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { downloadStorageAsset } from '@/lib/storage-response'

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> | { token: string } }
) {
  const { token } = await Promise.resolve(context.params)
  const shareToken = String(token || '').trim()

  if (!shareToken) {
    return NextResponse.json({ error: 'Missing share token' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('preview_share_links')
    .select('cover_bucket, cover_storage_path')
    .eq('share_token', shareToken)
    .maybeSingle()

  if (error || !data?.cover_storage_path) {
    return NextResponse.json({ error: 'Share image not found' }, { status: 404 })
  }

  try {
    return await downloadStorageAsset(data.cover_bucket || 'raw-private', data.cover_storage_path)
  } catch (downloadError: any) {
    return NextResponse.json(
      { error: downloadError?.message || 'Failed to load share image' },
      { status: 500 }
    )
  }
}
