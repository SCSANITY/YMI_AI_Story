import type { Metadata } from 'next'
import { Suspense } from 'react'
import PersonalizePage from '@/components/PersonalizePage';
import { CustomizeAccessGate } from '@/components/CustomizeAccessGate'
import { BOOKS } from '@/data/books'
import { publicPageMetadata } from '@/lib/seo'

function clampDescription(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 155) return normalized
  return `${normalized.slice(0, 152).trim()}...`
}

export function generateStaticParams() {
  return BOOKS.map((book) => ({ bookID: book.bookID }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookID: string }>;
}): Promise<Metadata> {
  const { bookID } = await params
  const templateId = String(bookID || '').trim()
  const book = BOOKS.find((item) => item.bookID === templateId)

  const title = String(book?.title || templateId || 'Personalized Storybook').trim()
  const baseDescription =
    String(book?.description || '').trim() ||
    `Create a personalized YMI Story picture book where your child becomes the hero.`
  const priceSuffix = typeof book?.price === 'number' ? ` Starting at $${book.price.toFixed(2)}.` : ''
  const description = clampDescription(`${baseDescription}${priceSuffix}`)

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

  return (
    <CustomizeAccessGate>
      <Suspense fallback={<main className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50" />}>
        <PersonalizePage bookID={bookID} />
      </Suspense>
    </CustomizeAccessGate>
  );
}
