import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { publicPageMetadata } from '@/lib/seo'

export const metadata: Metadata = publicPageMetadata({
  title: 'Collaboration',
  description: 'Partner with YMI Story as a creator, parent community, school, or family-focused brand.',
  path: '/collaboration',
})

export default function CollaborationLayout({ children }: { children: ReactNode }) {
  return children
}
