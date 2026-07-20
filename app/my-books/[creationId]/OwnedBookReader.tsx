'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Clock3, RefreshCw, ShoppingCart } from 'lucide-react'
import { PreviewBookPageContent } from '@/components/personalize/PreviewBookPageContent'
import { PreviewBookStage } from '@/components/personalize/PreviewBookStage'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { BOOKS } from '@/data/books'
import { parseTemplateAmount } from '@/lib/book-catalog'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import { useI18n } from '@/lib/useI18n'
import type { Book, PersonalizationData, StoryLanguage } from '@/types'

const PAGE_WIDTH = 380
const PAGE_HEIGHT = 380
const PREVIEW_HEIGHT = PAGE_HEIGHT + 40
const ANIMATION_DURATION = 0.8

type ReaderTemplate = {
  name?: string | null
  description?: string | null
  story_type?: string | null
  price_cents?: number | null
  compare_at_price_cents?: number | null
  discount_percent?: number | null
  is_discount?: boolean | null
}

type ReaderCreation = {
  creationId: string
  templateId: string
  previewJobId?: string | null
  template?: ReaderTemplate | null
  customizeSnapshot?: Record<string, unknown> | null
  coverUrl?: string | null
}

type ReaderPage = {
  pageIndex: number
  status?: string | null
  url?: string | null
}

type ReaderResponse = {
  eligible?: boolean
  purchaseState?: 'purchased' | 'refunded' | 'unpurchased'
  finalReady?: boolean
  reason?: string
  error?: string
  creation?: ReaderCreation
  latestOrderDisplayId?: string | null
  pages?: ReaderPage[]
}

function normalizeLanguage(value: unknown): StoryLanguage {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'traditional chinese' || raw === 'chinese' || raw === 'cn_t' || raw === 'zh-hk' || raw === 'traditional') {
    return 'Traditional Chinese'
  }
  if (raw === 'spanish' || raw === 'es') return 'Spanish'
  return 'English'
}

function normalizeBookType(value: unknown): PersonalizationData['bookType'] {
  return value === 'digital' || value === 'premium' || value === 'supreme' ? value : 'basic'
}

function getSnapshotParts(snapshotValue: unknown) {
  const snapshot = snapshotValue && typeof snapshotValue === 'object' && !Array.isArray(snapshotValue)
    ? snapshotValue as Record<string, unknown>
    : {}
  const overridesValue = snapshot.textOverrides ?? snapshot.text_overrides
  const textOverrides = overridesValue && typeof overridesValue === 'object' && !Array.isArray(overridesValue)
    ? overridesValue as Record<string, unknown>
    : {}
  return { snapshot, textOverrides }
}

function buildCartContext(creation: ReaderCreation): { book: Book; personalization: PersonalizationData } {
  const fallbackBook = BOOKS.find((book) => book.bookID === creation.templateId)
  const { snapshot, textOverrides } = getSnapshotParts(creation.customizeSnapshot)
  const basePrice = parseTemplateAmount(creation.template?.price_cents) ?? fallbackBook?.price ?? 0
  const compareAtPrice = parseTemplateAmount(creation.template?.compare_at_price_cents) ?? fallbackBook?.compareAtPrice ?? null
  const discountPercent = Number(creation.template?.discount_percent ?? fallbackBook?.discountPercent ?? 0)
  const childName = textOverrides.child_name ?? textOverrides.childName ?? ''
  const childAge = textOverrides.child_age ?? textOverrides.childAge ?? textOverrides.age ?? ''
  const bookType = normalizeBookType(textOverrides.book_type ?? snapshot.bookType)
  const coverUrl = creation.coverUrl || ''

  return {
    book: {
      bookID: creation.templateId,
      title: resolvePersonalizedBookTitle({
        templateId: creation.templateId,
        templateName: creation.template?.name,
        customizeSnapshot: creation.customizeSnapshot,
      }),
      author: fallbackBook?.author || 'YMI',
      price: basePrice,
      compareAtPrice,
      discountPercent: Number.isFinite(discountPercent) && discountPercent > 0 ? discountPercent : null,
      coverUrl,
      showcaseImages: coverUrl ? [coverUrl] : [],
      description: creation.template?.description || fallbackBook?.description || '',
      category: fallbackBook?.category || 'Adventure',
      ageRange: fallbackBook?.ageRange || '3-5',
      gender: fallbackBook?.gender || 'Neutral',
      isDiscount: Boolean(creation.template?.is_discount ?? fallbackBook?.isDiscount),
    },
    personalization: {
      childName: String(childName),
      childAge: String(childAge),
      language: normalizeLanguage(textOverrides.language),
      dedication: '',
      storagePath: typeof snapshot.storagePath === 'string' ? snapshot.storagePath : undefined,
      previewJobId: creation.previewJobId || (typeof snapshot.previewJobId === 'string' ? snapshot.previewJobId : undefined),
      creationId: creation.creationId,
      textOverrides,
      params: snapshot.params && typeof snapshot.params === 'object' && !Array.isArray(snapshot.params)
        ? snapshot.params as Record<string, unknown>
        : undefined,
      bookType,
    },
  }
}

export function OwnedBookReader({ creationId }: { creationId: string }) {
  const { t } = useI18n()
  const { user, isHydrated, addToCart } = useGlobalContext()
  const [reader, setReader] = useState<ReaderResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(1024)
  const [currentSpread, setCurrentSpread] = useState(0)
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipDirection, setFlipDirection] = useState<'next' | 'prev' | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(() => new Set())
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const flipTimerRef = useRef<number | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const loadRunIdRef = useRef(0)

  const loadReader = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isHydrated) return
    const runId = ++loadRunIdRef.current
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const suffix = user?.customerId ? `?customerId=${encodeURIComponent(user.customerId)}` : ''
      const response = await fetch(`/api/my-books/${encodeURIComponent(creationId)}/reader${suffix}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({})) as ReaderResponse
      if (!response.ok && response.status !== 403) {
        throw new Error(data.error || 'Failed to load reader')
      }
      if (runId !== loadRunIdRef.current) return
      setReader(data)
      setLoadError(null)
      setImageErrors(new Set())
    } catch (error) {
      if (runId === loadRunIdRef.current && !silent) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load reader')
      }
    } finally {
      if (runId === loadRunIdRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [creationId, isHydrated, user?.customerId])

  useEffect(() => {
    void loadReader()
  }, [loadReader])

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth)
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  useEffect(() => {
    if (!reader?.eligible || reader.finalReady) return
    const intervalId = window.setInterval(() => void loadReader({ silent: true }), 8000)
    return () => window.clearInterval(intervalId)
  }, [loadReader, reader?.eligible, reader?.finalReady])

  useEffect(() => {
    const refreshVisibleReader = () => {
      if (document.visibilityState === 'visible') void loadReader({ silent: true })
    }
    window.addEventListener('focus', refreshVisibleReader)
    window.addEventListener('pageshow', refreshVisibleReader)
    document.addEventListener('visibilitychange', refreshVisibleReader)
    return () => {
      window.removeEventListener('focus', refreshVisibleReader)
      window.removeEventListener('pageshow', refreshVisibleReader)
      document.removeEventListener('visibilitychange', refreshVisibleReader)
    }
  }, [loadReader])

  useEffect(() => () => {
    loadRunIdRef.current += 1
    if (flipTimerRef.current !== null) window.clearTimeout(flipTimerRef.current)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  const creation = reader?.creation ?? null
  const cartContext = useMemo(() => creation ? buildCartContext(creation) : null, [creation])
  const resolvedTitle = useMemo(() => creation
    ? resolvePersonalizedBookTitle({
        templateId: creation.templateId,
        templateName: creation.template?.name,
        customizeSnapshot: creation.customizeSnapshot,
      })
    : '', [creation])
  const signedInnerPages = useMemo(() => (reader?.pages ?? [])
    .slice()
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((page) => page.url || ''), [reader?.pages])
  const bookSpreads = useMemo(() => creation
    ? [creation.coverUrl || '', ...signedInnerPages]
    : [], [creation, signedInnerPages])
  const maxSpreadIndex = Math.max(0, bookSpreads.length - 1)

  useEffect(() => {
    setCurrentSpread((current) => Math.min(current, maxSpreadIndex))
  }, [maxSpreadIndex])

  useEffect(() => {
    if (!reader?.finalReady || !bookSpreads.length) return
    const immediateIndexes = new Set([
      Math.max(0, currentSpread - 1),
      currentSpread,
      currentSpread + 1,
      currentSpread + 2,
    ])
    const preload = (url: string) => {
      if (!url) return
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      void image.decode?.().catch(() => undefined)
    }
    immediateIndexes.forEach((index) => preload(bookSpreads[index] || ''))
    const backgroundId = window.setTimeout(() => {
      bookSpreads.forEach((url, index) => {
        if (!immediateIndexes.has(index)) preload(url)
      })
    }, 500)
    return () => window.clearTimeout(backgroundId)
  }, [bookSpreads, currentSpread, reader?.finalReady])

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2800)
  }, [])

  const handleBuyAgain = useCallback(async () => {
    if (!creation || !cartContext || adding) return
    setAdding(true)
    try {
      const item = await addToCart(
        cartContext.book,
        cartContext.personalization,
        3,
        undefined,
        creation.coverUrl || undefined
      )
      showToast(item ? t('myBooks.readerAdded') : t('myBooks.readerAddFailed'))
    } catch {
      showToast(t('myBooks.readerAddFailed'))
    } finally {
      setAdding(false)
    }
  }, [addToCart, adding, cartContext, creation, showToast, t])

  const turnPage = useCallback((direction: 'next' | 'prev') => {
    if (isFlipping) return
    if (direction === 'next' && currentSpread >= maxSpreadIndex) return
    if (direction === 'prev' && currentSpread <= 0) return
    setFlipDirection(direction)
    setIsFlipping(true)
    flipTimerRef.current = window.setTimeout(() => {
      setCurrentSpread((current) => direction === 'next' ? current + 1 : current - 1)
      setIsFlipping(false)
      setFlipDirection(null)
      flipTimerRef.current = null
    }, ANIMATION_DURATION * 1000)
  }, [currentSpread, isFlipping, maxSpreadIndex])

  const returnToCover = useCallback(() => {
    if (flipTimerRef.current !== null) window.clearTimeout(flipTimerRef.current)
    flipTimerRef.current = null
    setIsFlipping(false)
    setFlipDirection(null)
    setCurrentSpread(0)
  }, [])

  const handleImageError = useCallback((url: string) => {
    if (url) setImageErrors((current) => new Set(current).add(url))
    void loadReader({ silent: true })
  }, [loadReader])

  const isMobile = windowWidth < 768
  const previewScale = isMobile ? Math.min(0.58, Math.max(0.4, (windowWidth - 24) / (PAGE_WIDTH * 2))) : 1
  const stageHeight = isMobile ? Math.round(PREVIEW_HEIGHT * previewScale) + 12 : PREVIEW_HEIGHT
  const staticLeftIndex = isFlipping && flipDirection === 'prev' ? currentSpread - 1 : currentSpread
  const isLeftPageVisible = staticLeftIndex > 0
  const isClosing = isFlipping && flipDirection === 'prev' && currentSpread === 1
  const isVisualBookOpen = currentSpread > 0 || (isFlipping && flipDirection === 'next' && currentSpread === 0)
  const isBookClosed = !isVisualBookOpen
  const pageStackPattern: React.CSSProperties = {
    backgroundImage: 'repeating-linear-gradient(90deg, #fdfbf7, #fdfbf7 1px, #d1d5db 2px, #fdfbf7 3px)',
    boxShadow: 'inset 2px 0 5px rgba(0,0,0,0.1), 10px 10px 20px rgba(0,0,0,0.15)',
  }
  const centerBindingPattern: React.CSSProperties = {
    background: 'linear-gradient(90deg, #e5e5e5, #ffffff 30%, #ffffff 70%, #e5e5e5)',
    boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.1)',
    borderRadius: '2px',
    opacity: isBookClosed || isClosing ? 0 : 1,
    transition: isBookClosed || isClosing ? 'none' : 'opacity 0.2s ease-in-out 0.2s',
  }
  const faceStyle: React.CSSProperties = {
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    position: 'absolute',
    inset: 0,
    backgroundColor: 'white',
    transformStyle: 'preserve-3d',
  }

  if (!isHydrated || loading) return <MyBookReaderSkeleton />

  if (loadError || !reader || !reader.eligible || !creation) {
    return (
      <ReaderStateShell backLabel={t('myBooks.readerBack')}>
        <BookOpen className="h-10 w-10 text-gray-400" />
        <h1 className="mt-5 font-display text-2xl font-semibold text-gray-900">{t('myBooks.readerUnavailableTitle')}</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{t('myBooks.readerUnavailableBody')}</p>
        <button type="button" onClick={() => void loadReader()} className="mt-6 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
          {t('myBooks.readerRetry')}
        </button>
      </ReaderStateShell>
    )
  }

  if (!reader.finalReady) {
    return (
      <ReaderStateShell backLabel={t('myBooks.readerBack')}>
        <Clock3 className="h-10 w-10 text-amber-600" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{t('myBooks.readerEyebrow')}</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-gray-900">{resolvedTitle}</h1>
        <h2 className="mt-6 text-lg font-semibold text-gray-800">{t('myBooks.readerPreparingTitle')}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{t('myBooks.readerPreparingBody')}</p>
        {reader.latestOrderDisplayId ? <p className="mt-3 text-xs font-medium text-gray-400">{t('myBooks.orderLabel', { orderId: reader.latestOrderDisplayId })}</p> : null}
        <div className="mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => void loadReader({ silent: true })} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('myBooks.readerRefresh')}
          </button>
          <button type="button" onClick={() => void handleBuyAgain()} disabled={adding} className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            <ShoppingCart className="h-4 w-4" />
            {adding ? t('myBooks.readerAdding') : t('myBooks.readerBuyAgain')}
          </button>
        </div>
        {toast ? <ReaderToast message={toast} /> : null}
      </ReaderStateShell>
    )
  }

  const renderPageContent = (side: 'left' | 'right', spreadIndex: number) => (
    <PreviewBookPageContent
      side={side}
      spreadIndex={spreadIndex}
      bookType={cartContext?.personalization.bookType || 'basic'}
      previewPages={bookSpreads}
      previewImageErrors={imageErrors}
      staticPreviewSecondPageUrl={null}
      finalPreviewImages={[]}
      currentSpread={currentSpread}
      isFlipping={isFlipping}
      resolvedTitle={resolvedTitle}
      labels={{
        previewAlt: resolvedTitle,
        previewPageStillCreating: t('myBooks.readerPageUnavailable'),
        previewPageLocked: '',
        backToCover: t('personalize.backToCover'),
        locked: '',
        pageLabel: (pageNumber) => t('personalize.pageLabel', { num: pageNumber }),
      }}
      onImageError={handleImageError}
      onTurnPage={turnPage}
      onReturnToCover={returnToCover}
    />
  )

  return (
    <div className="page-surface min-h-screen overflow-x-hidden px-3 pb-16 pt-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/my-books" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          {t('myBooks.readerBack')}
        </Link>

        <header className="mx-auto mb-8 mt-8 max-w-2xl text-center md:mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{t('myBooks.readerEyebrow')}</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-gray-900 md:text-3xl">{resolvedTitle}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('myBooks.readerFullBook')}</p>
        </header>

        <PreviewBookStage
          stageHeight={stageHeight}
          previewScale={previewScale}
          pageWidth={PAGE_WIDTH}
          pageHeight={PAGE_HEIGHT}
          animationDuration={ANIMATION_DURATION}
          currentSpread={currentSpread}
          isFlipping={isFlipping}
          flipDirection={flipDirection}
          isLeftPageVisible={isLeftPageVisible}
          staticLeftIndex={staticLeftIndex}
          centerBindingPattern={centerBindingPattern}
          pageStackPattern={pageStackPattern}
          faceStyle={faceStyle}
          previewBookShadow="drop-shadow(10px 22px 36px rgba(0,0,0,0.16)) drop-shadow(4px 8px 14px rgba(0,0,0,0.08))"
          renderPageContent={renderPageContent}
        />

        <div className="mx-auto mt-3 flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-xs font-medium text-gray-400">{currentSpread === 0 ? t('myBooks.readyBadge') : `${currentSpread} / ${maxSpreadIndex}`}</p>
          <button type="button" onClick={() => void handleBuyAgain()} disabled={adding} className="inline-flex min-w-40 items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60">
            <ShoppingCart className="h-4 w-4" />
            {adding ? t('myBooks.readerAdding') : t('myBooks.readerBuyAgain')}
          </button>
        </div>
      </div>
      {toast ? <ReaderToast message={toast} /> : null}
    </div>
  )
}

function MyBookReaderSkeleton() {
  return (
    <div className="page-surface min-h-screen px-4 pb-16 pt-24">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-5 w-36 rounded-full bg-amber-100" />
        <div className="mx-auto mt-12 h-7 w-64 rounded-full bg-gray-200" />
        <div className="mx-auto mt-8 aspect-[2/1] w-full max-w-3xl rounded-lg bg-white/70 shadow-sm" />
      </div>
    </div>
  )
}

function ReaderStateShell({ children, backLabel }: { children: React.ReactNode; backLabel: string }) {
  return (
    <div className="page-surface min-h-screen px-4 pb-16 pt-24">
      <div className="mx-auto max-w-5xl">
        <Link href="/my-books" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="mx-auto flex min-h-[58vh] max-w-xl flex-col items-center justify-center text-center">
          {children}
        </div>
      </div>
    </div>
  )
}

function ReaderToast({ message }: { message: string }) {
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-[160] -translate-x-1/2 rounded-full border border-white/70 bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-xl">
      {message}
    </div>
  )
}
