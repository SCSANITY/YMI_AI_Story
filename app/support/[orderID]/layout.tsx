import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Order Support',
  ...noIndexMetadata,
}

export default function OrderSupportLayout({ children }: { children: ReactNode }) {
  return children
}
