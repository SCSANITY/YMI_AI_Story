'use client'

import { useEffect, useMemo, useState } from 'react'
import { BOOKS } from '@/data/books'
import { staticBookToCatalogBook, type CatalogBook } from '@/lib/book-catalog'

const FALLBACK_BOOKS = BOOKS.map(staticBookToCatalogBook)
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000

let cachedCatalog: { books: CatalogBook[]; loadedAt: number } | null = null
let catalogRequest: Promise<CatalogBook[]> | null = null

async function fetchCatalogBooks(): Promise<CatalogBook[]> {
  if (cachedCatalog && Date.now() - cachedCatalog.loadedAt < CATALOG_CACHE_TTL_MS) {
    return cachedCatalog.books
  }

  if (!catalogRequest) {
    catalogRequest = fetch('/api/templates', { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}))

        if (!response.ok || !Array.isArray(data?.templates)) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to load templates')
        }

        const books = data.templates.length ? data.templates : FALLBACK_BOOKS
        cachedCatalog = { books, loadedAt: Date.now() }
        return books
      })
      .finally(() => {
        catalogRequest = null
      })
  }

  return catalogRequest
}

export function useBookCatalog() {
  const [books, setBooks] = useState<CatalogBook[]>(cachedCatalog?.books ?? FALLBACK_BOOKS)
  const [isLoading, setIsLoading] = useState(!cachedCatalog)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadBooks = async () => {
      if (!cachedCatalog) setIsLoading(true)
      setError(null)

      try {
        const nextBooks = await fetchCatalogBooks()

        if (!isMounted) return

        setBooks(nextBooks)
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
