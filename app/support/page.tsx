import type { Metadata } from 'next'
import { publicPageMetadata } from '@/lib/seo'
import SupportPageClient from '@/components/SupportPageClient'

export const metadata: Metadata = publicPageMetadata({
  title: 'Support',
  description: 'Get help with your YMI Story order, personalization flow, delivery, or account questions.',
  path: '/support',
})

export default function SupportPage() {
  return <SupportPageClient />
}
