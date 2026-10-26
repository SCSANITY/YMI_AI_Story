import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import PersonalizePage from '@/components/PersonalizePage';
import { CustomizeAccessGate } from '@/components/CustomizeAccessGate'
import { publicPageMetadata } from '@/lib/seo'
import { loadActiveTemplateCatalog, loadActiveTemplateDetail } from '@/lib/template-catalog-server'
import { getPublishedHomepageBanners } from '@/lib/homepage-banners'

function clampDescription(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 155) return normalized
  return `${normalized.slice(0, 152).trim()}...`
}

export const dynamic = 'force-static'
export const dynamicParams = true
export const revalidate = 300

export async function generateStaticParams() {
  const books = await loadActiveTemplateCatalog({ strict: true })
  return books.map((book) => ({ bookID: book.bookID }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookID: string }>;
}): Promise<Metadata> {
  const { bookID } = await params
  const templateId = String(bookID || '').trim()
  const book = await loadActiveTemplateDetail(templateId)
  if (!book) notFound()

  const title = String(book?.title || templateId || 'Personalized Storybook').trim()
  const baseDescription =
    String(book?.description || '').trim() ||
    `Create a personalized YMI Story picture book where your child becomes the hero.`
  const description = clampDescription(baseDescription)

  return {
    ...publicPageMetadata({
      title: `${title} - Storybook`,
      description,
      path: `/personalize/${encodeURIComponent(templateId)}`,
      image: book?.coverUrl || undefined,
    }),
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ bookID: string }>;
}) {
  const { bookID } = await params;
  const initialBook = await loadActiveTemplateDetail(bookID)
  if (!initialBook) notFound()
  // Existing public cache; resolve only inside the below-fold banner Suspense.
  const closingBannerPromise = getPublishedHomepageBanners()
    .then((banners) => banners.after_in_discount)
    .catch(() => undefined)

  return (
    <CustomizeAccessGate>
      <Suspense fallback={<main className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50" />}>
        <PersonalizePage bookID={bookID} initialBook={initialBook} closingBannerPromise={closingBannerPromise} />
      </Suspense>
    </CustomizeAccessGate>
  );
}
