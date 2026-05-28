import Link from 'next/link'
import type { Metadata } from 'next'
import PersonalizePage from '@/components/PersonalizePage';
import { getCustomizeAccessSettings } from '@/lib/customize-access-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { parseTemplateAmount, templateStorageUrl, type TemplateCatalogRow } from '@/lib/book-catalog'
import { noIndexMetadata, publicPageMetadata } from '@/lib/seo'

function clampDescription(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 155) return normalized
  return `${normalized.slice(0, 152).trim()}...`
}

function formatUsdPrice(value: unknown) {
  const amount = parseTemplateAmount(value)
  if (amount === null) return null
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookID: string }>;
}): Promise<Metadata> {
  const { bookID } = await params
  const templateId = String(bookID || '').trim()

  if (!templateId) {
    return {
      title: 'Personalized Storybook',
      ...noIndexMetadata,
    }
  }

  const { data } = await supabaseAdmin
    .from('templates')
    .select('template_id, name, description, inner_description, cover_image_path, normalized_cover_image_path, price_cents, is_active, is_coming_soon')
    .eq('template_id', templateId)
    .maybeSingle()

  const row = data as TemplateCatalogRow | null

  if (!row?.template_id || row.is_active === false) {
    return {
      title: 'Personalized Storybook',
      ...noIndexMetadata,
    }
  }

  const title = String(row.name || templateId).trim()
  const price = formatUsdPrice(row.price_cents)
  const baseDescription =
    String(row.description || row.inner_description || '').trim() ||
    `Create a personalized YMI Story picture book where your child becomes the hero.`
  const priceSuffix = price ? ` Starting at ${price}.` : ''
  const description = clampDescription(`${baseDescription}${priceSuffix}`)
  const image = templateStorageUrl(row.normalized_cover_image_path || row.cover_image_path)

  return {
    ...publicPageMetadata({
      title: `${title} - Storybook`,
      description,
      path: `/personalize/${encodeURIComponent(templateId)}`,
      image: image || undefined,
    }),
    robots: row.is_coming_soon ? noIndexMetadata.robots : undefined,
  }
}

function CustomizeBlockedPage({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50 px-4 py-10 md:px-8 md:py-14">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-2xl items-center">
        <div className="w-full rounded-[32px] border border-amber-100 bg-white p-8 text-center shadow-[0_30px_120px_rgba(251,146,60,0.16)]">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-amber-600">Private Beta</p>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">Customize is temporarily closed</h1>
          <p className="mt-4 text-sm leading-7 text-gray-600">{message}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/books"
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-amber-200/70 transition-transform hover:scale-[1.02]"
            >
              Browse Books
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white px-8 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

export default async function Page({
  params,
}: {
  params: Promise<{ bookID: string }>;
}) {
  const { bookID } = await params;
  const customizeAccess = await getCustomizeAccessSettings()

  if (!customizeAccess.enabled) {
    return <CustomizeBlockedPage message={customizeAccess.message} />
  }

  return <PersonalizePage bookID={bookID} />;
}
