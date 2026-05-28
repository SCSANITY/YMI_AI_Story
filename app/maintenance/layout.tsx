import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { noIndexMetadata } from '@/lib/seo'

export const metadata: Metadata = {
  title: 'Maintenance',
  ...noIndexMetadata,
}

export default function MaintenanceLayout({ children }: { children: ReactNode }) {
  return children
}
