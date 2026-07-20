'use client'

import { useSearchParams } from 'next/navigation'
import { BookList } from '@/components/BookList'

export function BooksFilterBridge() {
  const searchParams = useSearchParams()
  const initialGenderQuery = searchParams.get('gender') ?? searchParams.get('for')

  return <BookList key={initialGenderQuery ?? 'all'} initialGenderQuery={initialGenderQuery} />
}
