import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'

type TemplateRelation = { name?: string | null } | { name?: string | null }[] | null

function getTemplateName(templates: TemplateRelation) {
  if (Array.isArray(templates)) {
    return templates[0]?.name ?? null
  }
  return templates?.name ?? null
}

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
        )
      `
    )
    .eq('share_token', shareToken)
    .maybeSingle()

  if (error || !data?.share_token) {
    return NextResponse.json({ error: 'Share link not found' }, { status: 404 })
  }

  return NextResponse.json({
    token: data.share_token,
    templateId: data.template_id,
    templateName: getTemplateName(data.templates as TemplateRelation),
    shareUrl: buildAbsoluteUrl(`/share/preview/${data.share_token}`),
    imageUrl: buildAbsoluteUrl(`/share/preview/${data.share_token}/image`),
  })
}
