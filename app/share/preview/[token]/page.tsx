import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildAbsoluteUrl } from '@/lib/site-url'
import { SITE_NAME, noIndexMetadata } from '@/lib/seo'
import { resolvePreviewShareDisplayTitle } from '@/lib/share-preview'
import { CustomizeAccessButton } from '@/components/CustomizeAccessButton'

const DEFAULT_PREVIEW_CAPTION =
  'A child becomes the hero of a magical YMI Story picture book. Take a peek at this personalized preview and imagine the adventure inside.'

async function loadPreviewShare(token: string) {
  const { data } = await supabaseAdmin
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

  const displayTitle = resolvePreviewShareDisplayTitle({
    templateId: share.template_id,
    templates: share.templates,
    creations: share.creations,
  })
  const title = `${displayTitle} | YMI Preview`
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
      siteName: SITE_NAME,
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
  const caption = normalizeCaption(searchParams?.caption)

  if (!share?.share_token) {
    notFound()
  }

  const displayTitle = resolvePreviewShareDisplayTitle({
    templateId: share.template_id,
    templates: share.templates,
    creations: share.creations,
  })
  const imagePath = `/share/preview/${share.share_token}/image`

  return (
    <div className="min-h-[calc(100dvh-84px)] w-full min-w-0 overflow-x-hidden bg-gradient-to-br from-amber-50 via-white to-orange-50 px-3 py-4 sm:px-4 sm:py-8 md:px-8 md:py-14">
      <div className="mx-auto w-full max-w-5xl min-w-0 overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-xl shadow-amber-100/40 sm:rounded-[32px]">
        <div className="grid min-w-0 gap-5 p-3 sm:p-5 md:grid-cols-[1.05fr_0.95fr] md:gap-8 md:p-10">
          <div className="relative aspect-square min-h-0 w-full min-w-0 overflow-hidden rounded-2xl border border-amber-100 bg-amber-50/30 sm:rounded-[28px] md:aspect-auto md:min-h-[520px]">
            <img
              src={imagePath}
              alt={displayTitle}
              className="h-full w-full object-contain"
            />
          </div>

          <div className="flex min-w-0 flex-col justify-center px-1 pb-2 sm:px-0 sm:pb-0">
            <div className="inline-flex w-fit max-w-full rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 sm:px-4 sm:text-xs sm:tracking-[0.24em]">
              YMI Preview
            </div>
            <h1 className="mt-4 text-3xl font-title leading-tight text-gray-900 sm:mt-5 sm:text-4xl md:text-5xl">
              A Personalized Storybook Worth Sharing
            </h1>
            <p className="mt-3 break-words text-sm leading-6 text-gray-600 sm:mt-4 sm:text-base sm:leading-7">
              {caption}
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row">
              <CustomizeAccessButton
                href={`/personalize/${share.template_id}`}
                className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200/70 transition-transform hover:scale-[1.02] sm:w-auto sm:px-8"
              >
                Create Your Own
              </CustomizeAccessButton>
              <Link
                href="/books"
                className="inline-flex w-full items-center justify-center rounded-full border border-amber-200 bg-white px-6 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 sm:w-auto sm:px-8"
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
