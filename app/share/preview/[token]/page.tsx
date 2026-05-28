import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'
import { noIndexMetadata } from '@/lib/seo'
import { CustomizeAccessButton } from '@/components/CustomizeAccessButton'

type TemplateRelation = { name?: string | null } | { name?: string | null }[] | null
const DEFAULT_PREVIEW_CAPTION =
  'A child becomes the hero of a magical YMI Story picture book. Take a peek at this personalized preview and imagine the adventure inside.'

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

function normalizeCaption(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  const caption = String(raw || '').trim()
  return caption.length > 0 ? caption.slice(0, 480) : DEFAULT_PREVIEW_CAPTION
}

function buildPreviewShareUrl(token: string, caption: string) {
  const path = `/share/preview/${token}`
  if (!caption || caption === DEFAULT_PREVIEW_CAPTION) return buildAbsoluteUrl(path)
  return buildAbsoluteUrl(`${path}?caption=${encodeURIComponent(caption)}`)
}

export async function generateMetadata(
  props: { params: Promise<{ token: string }>; searchParams?: Promise<{ caption?: string | string[] }> }
): Promise<Metadata> {
  const params = await props.params
  const searchParams = props.searchParams ? await props.searchParams : {}
  const token = String(params.token || '').trim()
  const share = token ? await loadPreviewShare(token) : null
  const caption = normalizeCaption(searchParams?.caption)

  if (!share?.share_token) {
    return {
      title: 'YMI Story Preview',
      description: caption,
      robots: noIndexMetadata.robots,
    }
  }

  const templateName = getTemplateName(share.templates as TemplateRelation)
  const title = templateName
    ? `${templateName} | YMI Preview`
    : 'YMI Story Preview'
  const description = caption
  const imageUrl = buildAbsoluteUrl(`/share/preview/${share.share_token}/image`)
  const url = buildPreviewShareUrl(share.share_token, caption)

  return {
    title,
    description,
    robots: noIndexMetadata.robots,
    openGraph: {
      title,
      description,
      url,
      images: [{ url: imageUrl, width: 1200, height: 1200, alt: title }],
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
  props: { params: Promise<{ token: string }>; searchParams?: Promise<{ caption?: string | string[] }> }
) {
  const params = await props.params
  const searchParams = props.searchParams ? await props.searchParams : {}
  const token = String(params.token || '').trim()
  const share = token ? await loadPreviewShare(token) : null
  const templateName = getTemplateName((share?.templates as TemplateRelation) ?? null)
  const caption = normalizeCaption(searchParams?.caption)

  if (!share?.share_token) {
    notFound()
  }

  const imagePath = `/share/preview/${share.share_token}/image`

  return (
    <div className="min-h-[calc(100vh-84px)] bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-10 md:px-8 md:py-14">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-amber-100 bg-white shadow-xl shadow-amber-100/40">
        <div className="grid gap-8 p-6 md:grid-cols-[1.05fr_0.95fr] md:p-10">
          <div className="relative min-h-[320px] overflow-hidden rounded-[28px] border border-amber-100 bg-amber-50/30 md:min-h-[520px]">
            <img
              src={imagePath}
              alt={templateName || 'YMI story preview'}
              className="h-full min-h-[320px] w-full object-contain md:min-h-[520px]"
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
              {caption}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <CustomizeAccessButton
                href={`/personalize/${share.template_id}`}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200/70 transition-transform hover:scale-[1.02]"
              >
                Create Your Own
              </CustomizeAccessButton>
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
