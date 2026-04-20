import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'

type TemplateRelation = { name?: string | null } | { name?: string | null }[] | null

function getTemplateName(templates: TemplateRelation) {
  if (Array.isArray(templates)) {
    return templates[0]?.name ?? null
  }
  return templates?.name ?? null
}

async function loadPreviewShare(token: string) {
  const { data } = await supabaseAdmin
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
    .eq('share_token', token)
    .maybeSingle()

  return data
}

export async function generateMetadata(
  props: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const params = await props.params
  const token = String(params.token || '').trim()
  const share = token ? await loadPreviewShare(token) : null

  if (!share?.share_token) {
    return {
      title: 'YMI Story Preview',
      description: 'See a personalized storybook cover from YMI.',
    }
  }

  const templateName = getTemplateName(share.templates as TemplateRelation)
  const title = templateName
    ? `${templateName} | YMI Preview`
    : 'YMI Story Preview'
  const description = 'Take a look at this personalized YMI storybook cover.'
  const imageUrl = buildAbsoluteUrl(`/share/preview/${share.share_token}/image`)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default async function PreviewSharePage(
  props: { params: Promise<{ token: string }> }
) {
  const params = await props.params
  const token = String(params.token || '').trim()
  const share = token ? await loadPreviewShare(token) : null
  const templateName = getTemplateName((share?.templates as TemplateRelation) ?? null)

  if (!share?.share_token) {
    notFound()
  }

  return (
    <div className="min-h-[calc(100vh-84px)] bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-amber-100 bg-white shadow-xl shadow-amber-100/40">
        <div className="grid gap-8 p-6 md:grid-cols-[1.05fr_0.95fr] md:p-10">
          <div className="overflow-hidden rounded-[28px] border border-amber-100 bg-amber-50/30">
            <img
              src={buildAbsoluteUrl(`/share/preview/${share.share_token}/image`)}
              alt={templateName || 'YMI story preview'}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
              YMI Preview
            </div>
            <h1 className="mt-5 text-4xl font-title text-gray-900 md:text-5xl">
              A Personalized Storybook Worth Sharing
            </h1>
            <p className="mt-4 text-base leading-7 text-gray-600">
              This shared preview only shows the cover. Create your own storybook and turn your child into the hero.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/personalize/${share.template_id}`}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200/70 transition-transform hover:scale-[1.02]"
              >
                Create Your Own
              </Link>
              <Link
                href="/books"
                className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white px-8 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
              >
                Browse Books
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
