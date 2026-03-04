'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { Button } from '@/components/Button'
import { BookOpen, ShoppingCart, Trash2, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BOOKS } from '@/data/books'
import { Book, PersonalizationData } from '@/types'
import { useRouter } from 'next/navigation'

type CreationItem = {
  creation_id: string
  template_id: string
  customize_snapshot?: Record<string, unknown> | null
  preview_job_id?: string | null
  preview_cover_url?: string | null
  is_archived?: boolean | null
  templates?: {
    template_id?: string
    name?: string
    description?: string
    cover_image_path?: string
    story_type?: string
  }
}

const normalizeLanguage = (value: unknown): PersonalizationData['language'] => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'cn_s' || raw === 'zh-cn' || raw === 'chinese' || raw === 'simplified') return 'cn_s'
  if (raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') return 'cn_t'
  return 'en'
}

const resolveCover = (row: CreationItem) => {
  const raw = row.preview_cover_url || row.templates?.cover_image_path || ''
  if (!raw) return ''
  if (raw.startsWith('http')) return raw
  const cleaned = raw.replace(/^app-templates\//, '').replace(/^\/+/, '')
  const { data } = supabase.storage.from('app-templates').getPublicUrl(cleaned)
  return data?.publicUrl ?? raw
}

const toPersonalization = (item: CreationItem): PersonalizationData => {
  const snapshot: any = item.customize_snapshot ?? {}
  const textOverrides: any = snapshot.textOverrides ?? snapshot.text_overrides ?? {}
  const childName = textOverrides.child_name ?? textOverrides.childName ?? ''
  const childAge = textOverrides.child_age ?? textOverrides.childAge ?? textOverrides.age ?? ''
  const language = textOverrides.language ?? 'English'
  const bookType = textOverrides.book_type ?? snapshot.bookType ?? 'basic'

  return {
    childName: String(childName),
    childAge: String(childAge),
    language: normalizeLanguage(language),
    dedication: '',
    storagePath: snapshot.storagePath ?? undefined,
    previewJobId: item.preview_job_id ?? snapshot.previewJobId ?? undefined,
    creationId: item.creation_id,
    textOverrides,
    params: snapshot.params ?? undefined,
    bookType,
  }
}

export default function MyBooksPage() {
  const router = useRouter()
  const { user, addToCart, hydrateCheckoutItems } = useGlobalContext()
  const [items, setItems] = useState<CreationItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const url = user?.customerId ? `/api/my-books?customerId=${user.customerId}` : '/api/my-books'

    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return
        const next = Array.isArray(data?.items) ? data.items : []
        setItems(next.filter((item: CreationItem) => item?.is_archived !== true))
      })
      .catch(() => {
        if (cancelled) return
        setItems([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.customerId])

  const handleAddToCart = async (item: CreationItem) => {
    const coverUrl = resolveCover(item)
    const fallbackBook = BOOKS.find((b) => b.bookID === item.template_id)
    const book: Book = {
      bookID: item.template_id,
      title: item.templates?.name || fallbackBook?.title || item.template_id,
      author: fallbackBook?.author || 'YMI',
      price: fallbackBook?.price || 0,
      coverUrl,
      description: item.templates?.description || fallbackBook?.description || '',
      category: fallbackBook?.category || 'Adventure',
      ageRange: fallbackBook?.ageRange || '3-5',
      gender: fallbackBook?.gender || 'Neutral',
    }
    const personalization = toPersonalization(item)
    await addToCart(book, personalization, 3, undefined, coverUrl)
  }

  const handleBuyNow = async (item: CreationItem) => {
    const coverUrl = resolveCover(item)
    const fallbackBook = BOOKS.find((b) => b.bookID === item.template_id)
    const book: Book = {
      bookID: item.template_id,
      title: item.templates?.name || fallbackBook?.title || item.template_id,
      author: fallbackBook?.author || 'YMI',
      price: fallbackBook?.price || 0,
      coverUrl,
      description: item.templates?.description || fallbackBook?.description || '',
      category: fallbackBook?.category || 'Adventure',
      ageRange: fallbackBook?.ageRange || '3-5',
      gender: fallbackBook?.gender || 'Neutral',
    }
    const personalization = toPersonalization(item)
    const mapProductType = (bookType?: PersonalizationData['bookType']) => {
      if (bookType === 'digital') return 'ebook'
      if (bookType === 'premium') return 'audio'
      return 'physical'
    }
    const priceAtPurchase =
      personalization.bookType === 'premium'
        ? book.price + 20
        : personalization.bookType === 'supreme'
        ? book.price + 50
        : book.price

    const response = await fetch('/api/orders/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        customerId: user?.customerId ?? null,
        items: [
          {
            creationId: item.creation_id,
            productType: mapProductType(personalization.bookType),
            quantity: 1,
            priceAtPurchase,
          },
        ],
      }),
    })

    if (!response.ok) return
    const data = await response.json()
    const cartItemIds = Array.isArray(data?.cartItemIds) ? data.cartItemIds : []
    if (!cartItemIds.length) return

    const idsQuery = encodeURIComponent(cartItemIds.join(','))
    const cartUrl = user?.customerId
      ? `/api/cart?ids=${idsQuery}&customerId=${encodeURIComponent(user.customerId)}`
      : `/api/cart?ids=${idsQuery}`
    const cartResponse = await fetch(cartUrl, { credentials: 'include' })
    if (cartResponse.ok) {
      const cartData = await cartResponse.json()
      const fetchedItems = Array.isArray(cartData?.items) ? cartData.items : []
      if (fetchedItems.length > 0) {
        hydrateCheckoutItems(fetchedItems)
      }
    }

    const params = new URLSearchParams()
    params.set('ids', cartItemIds.join(','))
    if (data?.orderId) params.set('orderId', data.orderId)
    router.push(`/checkout?${params.toString()}`)
  }

  const handleDelete = async (item: CreationItem) => {
    const confirmed = window.confirm('Delete this book? This action cannot be undone.')
    if (!confirmed) return

    const response = await fetch('/api/my-books', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        creationId: item.creation_id,
        customerId: user?.customerId ?? null,
      }),
    }).catch(() => null)

    if (!response || !response.ok) return
    setItems((prev) => prev.filter((row) => row.creation_id !== item.creation_id))
  }

  const goToPreview = (item: CreationItem) => {
    const coverUrl = resolveCover(item)
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(
          `ymi_preview_${item.creation_id}`,
          JSON.stringify({
            coverUrl,
            jobId: item.preview_job_id ?? null,
          })
        )
      } catch {
        // ignore cache errors
      }
    }
    const params = new URLSearchParams({ view: 'preview' })
    params.set('creationId', item.creation_id)
    if (item.preview_job_id) params.set('jobId', item.preview_job_id)
    router.push(`/personalize/${item.template_id}?${params.toString()}`)
  }

  const gridClass = useMemo(
    () => 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10',
    []
  )

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading your books...</div>
      </div>
    )
  }

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 space-y-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-title text-gray-900">My Books</h1>
            <p className="text-gray-500 text-sm">Your personalized story library.</p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-8 text-sm text-gray-500 text-center">
            No books yet. Generate a preview to start your library.
          </div>
        ) : (
          <div className={gridClass}>
            {items.map((item) => (
              <div
                key={item.creation_id}
                className="group relative flex flex-col h-full glass-panel rounded-2xl overflow-hidden hover:shadow-2xl hover:-translate-y-2 transition-all duration-500"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
                  <button
                    type="button"
                    onClick={() => goToPreview(item)}
                    className="block h-full w-full"
                  >
                    <img
                      src={resolveCover(item)}
                      alt={item.templates?.name || item.template_id}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="absolute top-2 right-2 md:top-3 md:right-3 h-6 w-6 rounded-full bg-white/80 text-gray-300 hover:text-red-500 hover:bg-white/95 shadow-sm opacity-0 group-hover:opacity-100 transition"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 mx-auto" />
                  </button>
                  <div className="absolute top-2 left-2 md:top-3 md:left-3 flex gap-2">
                    <span className="px-1.5 py-0.5 md:px-2 md:py-1 bg-white/90 backdrop-blur-sm text-[8px] md:text-[10px] font-bold uppercase tracking-wider rounded-md text-gray-800 shadow-sm">
                      {item.templates?.story_type || 'Story'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col flex-1 p-5 md:p-7">
                  <div className="flex flex-col flex-1">
                    <button type="button" onClick={() => goToPreview(item)} className="text-left">
                      <h3 className="font-display text-base md:text-lg font-medium text-gray-900 leading-tight mb-1 md:mb-2 line-clamp-2 md:line-clamp-none">
                        {item.templates?.name || item.template_id}
                      </h3>
                    </button>
                    <p className="text-sm text-gray-600 leading-relaxed hidden md:block">
                      {item.templates?.description || 'Personalized storybook'}
                    </p>
                  </div>

                  <div className="mt-auto pt-4 border-t border-gray-50 flex flex-col gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full rounded-full px-4 py-2 text-xs md:text-sm font-semibold border-amber-200 text-amber-700 hover:bg-amber-50"
                      onClick={() => handleAddToCart(item)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Add to Cart
                    </Button>
                    <Button
                      size="sm"
                      className="w-full rounded-full px-4 py-2 text-xs md:text-sm font-semibold"
                      onClick={() => handleBuyNow(item)}
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Buy Now
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
