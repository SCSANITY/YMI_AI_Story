import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'
import { resolvePreviewShareDisplayTitle } from '@/lib/share-preview'

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
    .select(
      `
        share_token,
        template_id,
        templates:templates (
          name
        ),
        creations:creations (
          customize_snapshot
        )
      `
    )
    .eq('share_token', shareToken)
    .maybeSingle()

  if (error || !data?.share_token) {
    return NextResponse.json({ error: 'Share link not found' }, { status: 404 })
  }

  const displayTitle = resolvePreviewShareDisplayTitle({
    templateId: data.template_id,
    templates: data.templates,
    creations: data.creations,
  })

  return NextResponse.json({
    token: data.share_token,
    templateId: data.template_id,
    templateName: displayTitle,
    displayTitle,
    shareUrl: buildAbsoluteUrl(`/share/preview/${data.share_token}`),
    imageUrl: buildAbsoluteUrl(`/share/preview/${data.share_token}/image`),
  })
}
