'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { AlertCircle, BookOpen, CheckCircle2, LogIn, RotateCw, X } from 'lucide-react'
import { BOOKS } from '@/data/books'
import { Book, PersonalizationData } from '@/types'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/useI18n'
import { useCustomizeNavigation } from '@/components/useCustomizeNavigation'
import { startOwnedCreationCheckout } from '@/lib/owned-creation-checkout-client'
import {
  packagePriceRowsToPricing,
  resolveBookPackageTypeFromSnapshot,
} from '@/lib/package-pricing'
import type { BookPackagePrice } from '@/types'
import { MyBooksGrid } from './MyBooksGrid'
import { PurchasedBooksGrid } from './PurchasedBooksGrid'
import { MyBooksShelfSwitcher } from './MyBooksShelfSwitcher'
import {
  buildMyBooksShelfPath,
  resolveInitialMyBooksShelf,
  type MyBooksShelf,
} from './myBooksShelf'
import type { CreationItem } from './myBooksTypes'
import { normalizeStoryLanguage } from '@/lib/story-language'
import { templateStorageUrl } from '@/lib/book-catalog'

const resolveCover = (row: CreationItem) => {
  const raw = row.preview_cover_url || row.templates?.normalized_cover_image_path || row.templates?.cover_image_path || ''
  return templateStorageUrl(raw)
}

const resolveTemplatePackagePrice = (item: CreationItem): BookPackagePrice | null => {
  try {
    const packageType = resolveBookPackageTypeFromSnapshot(item.customize_snapshot) ?? 'basic'
    return packagePriceRowsToPricing(item.templates?.package_prices)[packageType]
  } catch {
    return null
  }
}

const resolveTemplatePrice = (item: CreationItem) =>
  resolveTemplatePackagePrice(item)?.effectivePriceUsd ?? 0

const resolveTemplateCompareAtPrice = (item: CreationItem) => {
  const packagePrice = resolveTemplatePackagePrice(item)
  return packagePrice?.salePriceUsd === null || !packagePrice ? null : packagePrice.listPriceUsd
}

const resolveTemplateDiscountPercent = (item: CreationItem) =>
  resolveTemplatePackagePrice(item)?.discountPercent ?? null

const toPersonalization = (item: CreationItem): PersonalizationData => {
  const snapshot = item.customize_snapshot ?? {}
  const textOverridesValue = snapshot.textOverrides ?? snapshot.text_overrides
  const textOverrides = textOverridesValue && typeof textOverridesValue === 'object' && !Array.isArray(textOverridesValue)
    ? textOverridesValue as Record<string, unknown>
    : {}
  const childName = textOverrides.child_name ?? textOverrides.childName ?? ''
  const childAge = textOverrides.child_age ?? textOverrides.childAge ?? textOverrides.age ?? ''
  const language = textOverrides.language ?? 'English'
  const rawBookType = String(textOverrides.book_type ?? snapshot.bookType ?? 'basic')
  const bookType: PersonalizationData['bookType'] = ['digital', 'basic', 'premium', 'supreme'].includes(rawBookType)
    ? rawBookType as PersonalizationData['bookType']
    : 'basic'
  const paramsValue = snapshot.params
  const params = paramsValue && typeof paramsValue === 'object' && !Array.isArray(paramsValue)
    ? paramsValue as Record<string, unknown>
    : undefined

  return {
    childName: String(childName),
    childAge: String(childAge),
    language: normalizeStoryLanguage(language),
    dedication: '',
    storagePath: typeof snapshot.storagePath === 'string' ? snapshot.storagePath : undefined,
    previewJobId: item.preview_job_id ?? (typeof snapshot.previewJobId === 'string' ? snapshot.previewJobId : undefined),
    creationId: item.creation_id,
    textOverrides,
    params,
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

type MyBooksNotice = {
  tone: 'success' | 'error'
  message: string
  showCartAction?: boolean
}

function MyBooksStateCard({
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  message: string
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-10 text-center">
      <p className="text-sm leading-6 text-gray-500">{message}</p>
      <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onPrimary}
          className="inline-flex min-w-36 items-center justify-center rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="inline-flex min-w-36 items-center justify-center gap-2 rounded-full border border-amber-200 bg-white px-5 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function MyBooksPage() {
  const router = useRouter()
  const { t } = useI18n()
  const { user, displayCurrency, addToCart, hydrateCheckoutItems, openLoginModal } = useGlobalContext()
  const { navigateToCustomize, pendingCustomizeHref, prefetchCustomizeHref } = useCustomizeNavigation()
  const [items, setItems] = useState<CreationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<{ creationId: string; action: 'add' | 'buy' | 'delete' } | null>(null)
  const [pendingReaderHref, setPendingReaderHref] = useState<string | null>(null)
  const [activeShelf, setActiveShelf] = useState<MyBooksShelf | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<MyBooksNotice | null>(null)

  const loadBooks = useCallback(async (signal?: AbortSignal) => {
    const url = user?.customerId ? `/api/my-books?customerId=${user.customerId}` : '/api/my-books'

    setLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal })
      if (!response.ok) throw new Error('Failed to load My Books')
      const data = await response.json()
      if (signal?.aborted) return
      setItems(Array.isArray(data?.items) ? data.items : [])
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
      setLoadError(t('myBooks.loadError'))
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [t, user?.customerId])

  useEffect(() => {
    const controller = new AbortController()
    setActiveShelf(null)
    void loadBooks(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadBooks])

  const handleAddToCart = async (item: CreationItem) => {
    if (pendingAction) return
    setNotice(null)
    setPendingAction({ creationId: item.creation_id, action: 'add' })
    const coverUrl = resolveCover(item)
    const fallbackBook = BOOKS.find((b) => b.bookID === item.template_id)
    const packagePrice = resolveTemplatePackagePrice(item)
    const book: Book = {
      bookID: item.template_id,
      title: item.templates?.name || fallbackBook?.title || item.template_id,
      author: fallbackBook?.author || 'YMI',
      price: packagePrice?.effectivePriceUsd ?? 0,
      compareAtPrice: packagePrice?.salePriceUsd === null || !packagePrice ? null : packagePrice.listPriceUsd,
      discountPercent: packagePrice?.discountPercent ?? null,
      coverUrl,
      showcaseImages: fallbackBook?.showcaseImages || [coverUrl],
      description: item.templates?.description || fallbackBook?.description || '',
      category: fallbackBook?.category || 'Adventure',
      ageRange: fallbackBook?.ageRange || '3-5',
      gender: fallbackBook?.gender || 'Neutral',
      isDiscount: packagePrice?.salePriceUsd !== null && Boolean(packagePrice),
    }
    const personalization = toPersonalization(item)
    try {
      const cartItem = await addToCart(book, personalization, 3, undefined, coverUrl)
      setNotice(cartItem
        ? { tone: 'success', message: t('myBooks.addedToCart'), showCartAction: true }
        : { tone: 'error', message: t('myBooks.addToCartFailed') })
    } catch {
      setNotice({ tone: 'error', message: t('myBooks.addToCartFailed') })
    } finally {
      setPendingAction(null)
    }
  }

  const handleBuyNow = async (item: CreationItem) => {
    if (pendingAction) return
    setNotice(null)
    setPendingAction({ creationId: item.creation_id, action: 'buy' })
    let checkoutStarted = false
    try {
      const checkout = await startOwnedCreationCheckout({
        creationId: item.creation_id,
        customerId: user?.customerId,
      })
      if (checkout.cartItems.length > 0) hydrateCheckoutItems(checkout.cartItems)
      checkoutStarted = true
      router.push(checkout.checkoutHref)
    } catch {
      setNotice({ tone: 'error', message: t('myBooks.checkoutFailed') })
    } finally {
      if (!checkoutStarted) setPendingAction(null)
    }
  }

  const handleDelete = async (item: CreationItem) => {
    if (pendingAction) return
    setNotice(null)
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

      if (!response || !response.ok) {
        setNotice({ tone: 'error', message: t('myBooks.deleteFailed') })
        return
      }
      setItems((prev) => prev.filter((row) => row.creation_id !== item.creation_id))
      setNotice({ tone: 'success', message: t('myBooks.deleteSuccess') })
    } finally {
      setPendingAction(null)
    }
  }

  const buildPreviewHref = (item: CreationItem) => {
    const params = new URLSearchParams({ view: 'preview', source: 'my-books' })
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

  useEffect(() => {
    if (loading || activeShelf !== null) return
    const requestedShelf = new URL(window.location.href).searchParams.get('shelf')
    setActiveShelf(resolveInitialMyBooksShelf(requestedShelf, purchasedItems.length))
  }, [activeShelf, loading, purchasedItems.length])

  const handleShelfChange = useCallback((shelf: MyBooksShelf) => {
    setActiveShelf(shelf)
    window.history.replaceState(
      window.history.state,
      '',
      buildMyBooksShelfPath(window.location.href, shelf)
    )
  }, [])

  const isResolvingShelf = !loading && hasVisibleItems && activeShelf === null

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-24 pb-16">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('myBooks.title')}</h1>
              <p className="text-gray-500 text-sm">{t('myBooks.subtitle')}</p>
            </div>
          </div>

          {!loading && !isResolvingShelf && hasVisibleItems && activeShelf ? (
            <MyBooksShelfSwitcher
              activeShelf={activeShelf}
              purchasedCount={purchasedItems.length}
              previewCount={unpurchasedItems.length}
              purchasedLabel={t('myBooks.purchasedTitle')}
              purchasedDescription={t('myBooks.purchasedTabDescription')}
              previewsLabel={t('myBooks.unpurchasedTitle')}
              previewsDescription={t('myBooks.unpurchasedTabDescription')}
              ariaLabel={t('myBooks.shelfSwitcherLabel')}
              onChange={handleShelfChange}
            />
          ) : null}
        </header>

        <div className="mt-8 md:mt-10">
        {notice ? (
          <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={`fixed bottom-6 left-1/2 z-[160] flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl ${
              notice.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span className="flex items-center gap-2 font-medium">
              {notice.tone === 'error'
                ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                : <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {notice.message}
            </span>
            {notice.showCartAction ? (
              <button type="button" onClick={() => router.push('/cart')} className="ml-auto font-semibold underline underline-offset-4">
                {t('myBooks.viewCart')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setNotice(null)}
              className={`${notice.showCartAction ? '' : 'ml-auto'} rounded-full p-1 transition hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current`}
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {loading || isResolvingShelf ? (
          <MyBooksLoadingGrid gridClass={gridClass} />
        ) : loadError ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50/90 px-6 py-10 text-center text-red-800">
            <AlertCircle className="mx-auto h-8 w-8" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium">{loadError}</p>
            <button type="button" onClick={() => void loadBooks()} className="mt-5 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              {t('myBooks.retry')}
            </button>
          </div>
        ) : !hasVisibleItems ? (
          <MyBooksStateCard
            message={t('myBooks.empty')}
            primaryLabel={t('common.browseBooks')}
            onPrimary={() => router.push('/books')}
            secondaryLabel={!user ? t('navbar.logIn') : undefined}
            onSecondary={!user ? openLoginModal : undefined}
          />
        ) : (
            <section
              key={activeShelf}
              id={`my-books-panel-${activeShelf}`}
              role="tabpanel"
              aria-labelledby={`my-books-tab-${activeShelf}`}
              tabIndex={0}
              className="animate-in fade-in slide-in-from-bottom-2 duration-200 focus:outline-none"
            >
              {activeShelf === 'purchased' ? (
                purchasedItems.length > 0 ? (
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
                ) : (
                  <MyBooksStateCard
                    message={t('myBooks.purchasedEmpty')}
                    primaryLabel={t('common.browseBooks')}
                    onPrimary={() => router.push('/books')}
                  />
                )
              ) : unpurchasedItems.length > 0 ? (
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
              ) : (
                <MyBooksStateCard
                  message={t('myBooks.previewsEmpty')}
                  primaryLabel={t('common.browseBooks')}
                  onPrimary={() => router.push('/books')}
                />
              )}
            </section>
        )}
        </div>
      </div>
    </div>
  )
}
