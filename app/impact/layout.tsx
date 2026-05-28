import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Children\'s Impact Program',
  ...noIndexMetadata,
}

export default function ImpactLayout({ children }: { children: ReactNode }) {
  return children
}
