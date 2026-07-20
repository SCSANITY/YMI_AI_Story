'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { BookOpen } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BOOKS } from '@/data/books'
import { Book, PersonalizationData } from '@/types'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/useI18n'
import { useCustomizeNavigation } from '@/components/useCustomizeNavigation'
import { parseTemplateAmount } from '@/lib/book-catalog'
import { MyBooksGrid } from './MyBooksGrid'
import { PurchasedBooksGrid } from './PurchasedBooksGrid'
import type { CreationItem } from './myBooksTypes'

const normalizeLanguage = (value: unknown): PersonalizationData['language'] => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'traditional chinese' || raw === 'chinese' || raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') {
    return 'Traditional Chinese'
  }
  if (raw === 'spanish' || raw === 'es') return 'Spanish'
  return 'English'
}

const resolveCover = (row: CreationItem) => {
  const raw = row.preview_cover_url || row.templates?.normalized_cover_image_path || row.templates?.cover_image_path || ''
  if (!raw) return ''
  if (raw.startsWith('http')) return raw
  const cleaned = raw.replace(/^app-templates\//, '').replace(/^\/+/, '')
  const { data } = supabase.storage.from('app-templates').getPublicUrl(cleaned)
  return data?.publicUrl ?? raw
}

const resolveTemplatePrice = (item: CreationItem, fallbackBook?: Book) => {
  const priceFromTemplate = parseTemplateAmount(item.templates?.price_cents)
  if (priceFromTemplate !== null) return priceFromTemplate
  return fallbackBook?.price || 0
}

const resolveTemplateCompareAtPrice = (item: CreationItem, fallbackBook?: Book, price = 0) => {
  const compareFromTemplate = parseTemplateAmount(item.templates?.compare_at_price_cents)
  if (compareFromTemplate !== null) return compareFromTemplate
  if (fallbackBook?.compareAtPrice) return fallbackBook.compareAtPrice
  return item.templates?.is_discount ? price * 2 : null
}

const resolveTemplateDiscountPercent = (item: CreationItem, fallbackBook?: Book, price = 0, compareAtPrice: number | null = null) => {
  const percentFromTemplate = Number(item.templates?.discount_percent ?? 0)
  if (Number.isFinite(percentFromTemplate) && percentFromTemplate > 0) return Math.round(percentFromTemplate)
  if (fallbackBook?.discountPercent) return fallbackBook.discountPercent
  if (compareAtPrice && compareAtPrice > price) return Math.round((1 - price / compareAtPrice) * 100)
  return item.templates?.is_discount ? 50 : null
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

function MyBooksLoadingGrid({ gridClass }: { gridClass: string }) {
  return (
    <div className={gridClass} aria-label="Loading saved books">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-[22px] border border-white/70 bg-white/75 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        >
          <div className="aspect-[4/5] animate-pulse bg-gradient-to-br from-amber-50 via-orange-50 to-white" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded-full bg-gray-200" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-gray-100" />
            <div className="flex gap-2 pt-2">
              <div className="h-9 flex-1 animate-pulse rounded-full bg-amber-100/80" />
              <div className="h-9 w-20 animate-pulse rounded-full bg-gray-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MyBooksPage() {
  const router = useRouter()
  const { t } = useI18n()
  const { user, displayCurrency, addToCart, hydrateCheckoutItems } = useGlobalContext()
  const { navigateToCustomize, pendingCustomizeHref, prefetchCustomizeHref } = useCustomizeNavigation()
  const [items, setItems] = useState<CreationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<{ creationId: string; action: 'add' | 'buy' | 'delete' } | null>(null)
  const [pendingReaderHref, setPendingReaderHref] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const url = user?.customerId ? `/api/my-books?customerId=${user.customerId}` : '/api/my-books'

    fetch(url, { credentials: 'include', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return
        const next = Array.isArray(data?.items) ? data.items : []
        setItems(next)
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
    if (pendingAction) return
    setPendingAction({ creationId: item.creation_id, action: 'add' })
    const coverUrl = resolveCover(item)
    const fallbackBook = BOOKS.find((b) => b.bookID === item.template_id)
    const book: Book = {
      bookID: item.template_id,
      title: item.templates?.name || fallbackBook?.title || item.template_id,
      author: fallbackBook?.author || 'YMI',
      price: resolveTemplatePrice(item, fallbackBook),
      compareAtPrice: resolveTemplateCompareAtPrice(item, fallbackBook, resolveTemplatePrice(item, fallbackBook)),
      discountPercent: resolveTemplateDiscountPercent(item, fallbackBook, resolveTemplatePrice(item, fallbackBook), resolveTemplateCompareAtPrice(item, fallbackBook, resolveTemplatePrice(item, fallbackBook))),
      coverUrl,
      showcaseImages: fallbackBook?.showcaseImages || [coverUrl],
      description: item.templates?.description || fallbackBook?.description || '',
      category: fallbackBook?.category || 'Adventure',
      ageRange: fallbackBook?.ageRange || '3-5',
      gender: fallbackBook?.gender || 'Neutral',
      isDiscount: Boolean(item.templates?.is_discount ?? fallbackBook?.isDiscount),
    }
    const personalization = toPersonalization(item)
    try {
      await addToCart(book, personalization, 3, undefined, coverUrl)
    } finally {
      setPendingAction(null)
    }
  }

  const handleBuyNow = async (item: CreationItem) => {
    if (pendingAction) return
    setPendingAction({ creationId: item.creation_id, action: 'buy' })
    const coverUrl = resolveCover(item)
    const fallbackBook = BOOKS.find((b) => b.bookID === item.template_id)
    const book: Book = {
      bookID: item.template_id,
      title: item.templates?.name || fallbackBook?.title || item.template_id,
      author: fallbackBook?.author || 'YMI',
      price: resolveTemplatePrice(item, fallbackBook),
      compareAtPrice: resolveTemplateCompareAtPrice(item, fallbackBook, resolveTemplatePrice(item, fallbackBook)),
      discountPercent: resolveTemplateDiscountPercent(item, fallbackBook, resolveTemplatePrice(item, fallbackBook), resolveTemplateCompareAtPrice(item, fallbackBook, resolveTemplatePrice(item, fallbackBook))),
      coverUrl,
      showcaseImages: fallbackBook?.showcaseImages || [coverUrl],
      description: item.templates?.description || fallbackBook?.description || '',
      category: fallbackBook?.category || 'Adventure',
      ageRange: fallbackBook?.ageRange || '3-5',
      gender: fallbackBook?.gender || 'Neutral',
      isDiscount: Boolean(item.templates?.is_discount ?? fallbackBook?.isDiscount),
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

    try {
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
    } finally {
      setPendingAction(null)
    }
  }

  const handleDelete = async (item: CreationItem) => {
    if (pendingAction) return
    const confirmed = window.confirm(t('myBooks.deleteConfirm'))
    if (!confirmed) return

    setPendingAction({ creationId: item.creation_id, action: 'delete' })
    try {
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
    } finally {
      setPendingAction(null)
    }
  }

  const buildPreviewHref = (item: CreationItem) => {
    const params = new URLSearchParams({ view: 'preview' })
    params.set('creationId', item.creation_id)
    if (item.preview_job_id) params.set('jobId', item.preview_job_id)
    return `/personalize/${item.template_id}?${params.toString()}`
  }

  const buildReaderHref = (item: CreationItem) => `/my-books/${item.creation_id}`

  const goToReader = (item: CreationItem) => {
    if (item.purchaseState === 'refunded') return
    const href = buildReaderHref(item)
    setPendingReaderHref(href)
    router.push(href)
  }

  const prefetchReader = (item: CreationItem) => {
    if (item.purchaseState === 'refunded') return
    router.prefetch(buildReaderHref(item))
  }

  const goToPreview = (item: CreationItem) => {
    const coverUrl = resolveCover(item)
    void navigateToCustomize(buildPreviewHref(item), {
      onBeforeNavigate: () => {
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
      },
    })
  }

  const gridClass = useMemo(
    () => 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-10',
    []
  )
  const purchasedItems = useMemo(
    () => items.filter((item) => item.purchaseState === 'purchased' || item.purchaseState === 'refunded'),
    [items]
  )
  const unpurchasedItems = useMemo(
    () => items.filter((item) => (item.purchaseState ?? 'unpurchased') === 'unpurchased' && item?.is_archived !== true),
    [items]
  )
  const hasVisibleItems = purchasedItems.length > 0 || unpurchasedItems.length > 0

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-16 space-y-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('myBooks.title')}</h1>
            <p className="text-gray-500 text-sm">{t('myBooks.subtitle')}</p>
          </div>
        </div>

        {loading ? (
          <MyBooksLoadingGrid gridClass={gridClass} />
        ) : !hasVisibleItems ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-8 text-sm text-gray-500 text-center">
            {t('myBooks.empty')}
          </div>
        ) : (
          <div className="space-y-12">
            {purchasedItems.length > 0 ? (
              <section className="space-y-5" aria-labelledby="purchased-books-heading">
                <div className="space-y-1">
                  <h2 id="purchased-books-heading" className="text-xl font-display font-semibold text-gray-900">
                    {t('myBooks.purchasedTitle')}
                  </h2>
                  <p className="text-sm text-gray-500">{t('myBooks.purchasedSubtitle')}</p>
                </div>
                <PurchasedBooksGrid
                  items={purchasedItems}
                  gridClass={gridClass}
                  pendingReaderHref={pendingReaderHref}
                  t={t}
                  resolveCover={resolveCover}
                  buildReaderHref={buildReaderHref}
                  onPrefetchReader={prefetchReader}
                  onOpenReader={goToReader}
                />
              </section>
            ) : null}

            {unpurchasedItems.length > 0 ? (
              <section className="space-y-5" aria-labelledby="unpurchased-books-heading">
                <div className="space-y-1">
                  <h2 id="unpurchased-books-heading" className="text-xl font-display font-semibold text-gray-900">
                    {t('myBooks.unpurchasedTitle')}
                  </h2>
                  <p className="text-sm text-gray-500">{t('myBooks.unpurchasedSubtitle')}</p>
                </div>
                <MyBooksGrid
                  items={unpurchasedItems}
                  gridClass={gridClass}
                  displayCurrency={displayCurrency}
                  pendingCustomizeHref={pendingCustomizeHref}
                  pendingAction={pendingAction}
                  t={t}
                  resolveCover={resolveCover}
                  resolveTemplatePrice={resolveTemplatePrice}
                  resolveTemplateCompareAtPrice={resolveTemplateCompareAtPrice}
                  resolveTemplateDiscountPercent={resolveTemplateDiscountPercent}
                  buildPreviewHref={buildPreviewHref}
                  onPreview={goToPreview}
                  onPrefetchPreview={prefetchCustomizeHref}
                  onDelete={handleDelete}
                  onAddToCart={(item) => void handleAddToCart(item)}
                  onBuyNow={(item) => void handleBuyNow(item)}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
