import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'My Books',
}

export default function MyBooksLayout({ children }: { children: ReactNode }) {
  return children
}
