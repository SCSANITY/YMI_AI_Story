import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Checkout',
  ...noIndexMetadata,
}

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children
}
