import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Cart',
  ...noIndexMetadata,
}

export default function CartLayout({ children }: { children: ReactNode }) {
  return children
}
