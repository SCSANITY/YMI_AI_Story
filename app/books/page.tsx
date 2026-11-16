import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BooksFilterBridge } from '@/components/BooksFilterBridge'
import { Footer } from '@/components/Footer'
import { publicPageMetadata } from '@/lib/seo'
import { HOME_AND_BOOKS_SEARCH_DESCRIPTION } from '@/lib/search-copy'

export const metadata: Metadata = {
  ...publicPageMetadata({
    title: 'Personalized Storybook Catalog',
    description: 'Browse YMI Story books and choose a personalized adventure for your child, with magical themes, AI previews, and storybook keepsakes.',
    path: '/books',
  }),
  description: HOME_AND_BOOKS_SEARCH_DESCRIPTION,
}

export default function BooksPage() {
  return (
    <>
      <Suspense fallback={null}>
        <BooksFilterBridge />
      </Suspense>
      <Footer />
    </>
  )
}
