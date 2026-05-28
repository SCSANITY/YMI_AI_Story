import type { Metadata } from 'next'
import { Footer } from '@/components/Footer'
import { BlogBoardClient } from '@/components/blog/BlogBoardClient'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Community',
  description: 'Read YMI Story updates, family storytelling ideas, product announcements, and personalized storybook inspiration.',
  path: '/community',
})

export default function CommunityPage() {
  return (
    <>
      <BlogBoardClient />
      <Footer />
    </>
  )
}
