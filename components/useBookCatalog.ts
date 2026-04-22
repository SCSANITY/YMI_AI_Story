'use client'

import { useEffect, useMemo, useState } from 'react'
import { BOOKS } from '@/data/books'
import { staticBookToCatalogBook, type CatalogBook } from '@/lib/book-catalog'

const FALLBACK_BOOKS = BOOKS.map(staticBookToCatalogBook)

export function useBookCatalog() {
  const [books, setBooks] = useState<CatalogBook[]>(FALLBACK_BOOKS)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadBooks = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/templates', { credentials: 'include' })
        const data = await response.json().catch(() => ({}))

        if (!isMounted) return

        if (!response.ok || !Array.isArray(data?.templates)) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to load templates')
        }

        setBooks(data.templates.length ? data.templates : FALLBACK_BOOKS)
      } catch (loadError) {
        if (!isMounted) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load templates')
        setBooks(FALLBACK_BOOKS)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadBooks()

    return () => {
      isMounted = false
    }
  }, [])

  return useMemo(
    () => ({
      books,
      isLoading,
      error,
    }),
    [books, error, isLoading]
  )
}
