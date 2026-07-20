import type { Metadata } from 'next'
import { OwnedBookReader } from './OwnedBookReader'

export const metadata: Metadata = {
  title: 'My Book | YMI Story',
}

export default async function MyBookReaderPage({
  params,
}: {
  params: Promise<{ creationId: string }>
}) {
  const { creationId } = await params
  return <OwnedBookReader creationId={creationId} />
}
