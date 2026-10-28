'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, Clock3, CreditCard, RefreshCw } from 'lucide-react'
import { PreviewBookPageContent } from '@/components/personalize/PreviewBookPageContent'
import { PreviewBookShell } from '@/components/personalize/PreviewBookShell'
import { usePreviewBookNavigation } from '@/components/personalize/usePreviewBookNavigation'
import { useDecodedPreviewCover } from '@/components/personalize/useDecodedPreviewCover'
import { useGlobalContext } from '@/contexts/GlobalContext'
import type { TemplateCatalogRow } from '@/lib/book-catalog'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import {
  buildReaderBookDisplay,
  getReaderSpreadUrls,
  type ReaderBookDisplay,
  type SignedReaderPage,
} from '@/lib/reader-page-contract'
import { useI18n } from '@/lib/useI18n'
import { SignatureVoiceEditionNotice } from '@/components/SignatureVoiceEditionNotice'
import { isSignatureVoicePackage } from '@/lib/signature-voice'

type ReaderTemplate = TemplateCatalogRow

type ReaderCreation = {
  creationId: string
  templateId: string
  previewJobId?: string | null
  template?: ReaderTemplate | null
  customizeSnapshot?: Record<string, unknown> | null
  coverUrl?: string | null
}

type ReaderResponse = {
  eligible?: boolean
  purchaseState?: 'purchased' | 'refunded' | 'unpurchased'
  finalReady?: boolean
  reason?: string
  error?: string
  schemaVersion?: number | null
  assetLayout?: string | null
  creation?: ReaderCreation
  latestOrderDisplayId?: string | null
  latestPackageType?: string | null
  pages?: Array<Omit<SignedReaderPage, 'url'> & { url?: string | null }>
}

type ReaderLoadIssue = 'signed_out' | 'not_found' | 'not_purchased' | 'refunded' | 'service' | 'invalid'

function resolveReaderLoadIssue(status: number, response: ReaderResponse): ReaderLoadIssue {
  if (status === 401) return 'signed_out'
  if (status === 404) return 'not_found'
  if (status === 403 && response.reason === 'refunded') return 'refunded'
  if (status === 403) return 'not_purchased'
  return 'service'
}

export function OwnedBookReader({ creationId }: { creationId: string }) {
  const router = useRouter()
  const { t } = useI18n()
  const { user, isHydrated, openLoginModal } = useGlobalContext()
  const [reader, setReader] = useState<ReaderResponse | null>(null)
  const [bookDisplay, setBookDisplay] = useState<ReaderBookDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<ReaderLoadIssue | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(() => new Set())
  const [checkoutPending, setCheckoutPending] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)
  const checkoutInFlightRef = useRef(false)
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
      if (!response.ok) {
        if (runId === loadRunIdRef.current && !silent) {
          setLoadError(resolveReaderLoadIssue(response.status, data))
          setReader(data)
          setBookDisplay(null)
        }
        return
      }
      let nextBookDisplay: ReaderBookDisplay | null = null
      try {
        nextBookDisplay = data.finalReady
          ? buildReaderBookDisplay({
              schemaVersion: data.schemaVersion,
              assetLayout: data.assetLayout,
              pages: (data.pages ?? []).map((page) => {
                if (!page.url) throw new Error(`Missing signed Reader URL for page ${page.pageIndex}`)
                return { ...page, url: page.url }
              }),
            })
          : null
      } catch {
        if (runId === loadRunIdRef.current && !silent) setLoadError('invalid')
        return
      }
      if (runId !== loadRunIdRef.current) return
      setReader(data)
      setBookDisplay(nextBookDisplay)
      setLoadError(null)
      setImageErrors(new Set())
    } catch {
      if (runId === loadRunIdRef.current && !silent) setLoadError('service')
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
  }, [])

  const creation = reader?.creation ?? null
  const resolvedTitle = useMemo(() => creation
    ? resolvePersonalizedBookTitle({
        templateId: creation.templateId,
        templateName: creation.template?.name,
        customizeSnapshot: creation.customizeSnapshot,
      })
    : '', [creation])
  const maxSpreadIndex = bookDisplay?.maxSpreadIndex ?? 0

  const canReadBook = Boolean(!loading && !loadError && reader?.eligible && reader.finalReady && bookDisplay)
  const navigation = usePreviewBookNavigation(creationId, maxSpreadIndex, canReadBook)
  const { currentSpread, isFlipping, turnPage, returnToCover, reconcile } = navigation
  useLayoutEffect(() => {
    reconcile(maxSpreadIndex, canReadBook)
  }, [maxSpreadIndex, canReadBook, reconcile])

  const handleImageError = useCallback((url: string) => {
    if (url) setImageErrors((current) => new Set(current).add(url))
    void loadReader({ silent: true })
  }, [loadReader])
  const coverCandidate = canReadBook ? bookDisplay?.coverUrl ?? null : null
  const handleCoverError = useCallback(() => {
    if (coverCandidate) setImageErrors((current) => new Set(current).add(coverCandidate))
  }, [coverCandidate])
  // A signing token is not a book identity. Decode offscreen and share the
  // retained URL across the cover face and every board, just as Preview does.
  const decodedCover = useDecodedPreviewCover(creationId, coverCandidate, handleCoverError)
  const visiblePresentation = useMemo(() => {
    const presentation = bookDisplay?.presentation
    if (!presentation?.cover || !decodedCover.url) return presentation
    return { ...presentation, cover: { ...presentation.cover, url: decodedCover.url } }
  }, [bookDisplay, decodedCover.url])

  useEffect(() => {
    if (!reader?.finalReady || !bookDisplay) return
    const immediateIndexes = new Set([
      Math.max(0, currentSpread - 1),
      currentSpread,
      currentSpread + 1,
    ])
    const preload = (url: string) => {
      if (!url) return
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      void image.decode?.().catch(() => undefined)
    }
    immediateIndexes.forEach((index) => {
      // Cover decode/prefetch is owned by useDecodedPreviewCover, not twice here.
      if (index === 0) return
      getReaderSpreadUrls(bookDisplay, index).forEach((url) => {
        preload(url)
      })
    })
  }, [bookDisplay, currentSpread, reader?.finalReady])

  const handleBuyAgain = useCallback(async () => {
    if (!creation || checkoutInFlightRef.current) return
    checkoutInFlightRef.current = true
    setCheckoutPending(true)
    setCheckoutError(null)
    const params = new URLSearchParams({ view: 'preview', creationId: creation.creationId,
      source: 'my-books', dedication: '1', purchase: '1' })
    if (creation.previewJobId) params.set('jobId', creation.previewJobId)
    router.push(`/personalize/${creation.templateId}?${params.toString()}`)
  }, [creation, router])

  if (!isHydrated || loading || (canReadBook && !decodedCover.isReady && !imageErrors.has(coverCandidate ?? ''))) return <MyBookReaderSkeleton />

  if (loadError || !reader || !reader.eligible || !creation || (reader.finalReady && !bookDisplay)) {
    const issue = loadError ?? 'invalid'
    const title = t(`myBooks.readerIssue.${issue}.title`)
    const body = t(`myBooks.readerIssue.${issue}.body`)
    const canRetry = issue === 'service' || issue === 'invalid'
    return (
      <ReaderStateShell backLabel={t('myBooks.readerBack')}>
        <BookOpen className="h-10 w-10 text-gray-400" />
        <h1 className="mt-5 font-display text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{body}</p>
        {issue === 'signed_out' ? (
          <button type="button" onClick={() => openLoginModal('login')} className="mt-6 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
            {t('navbar.logIn')}
          </button>
        ) : canRetry ? (
          <button type="button" onClick={() => void loadReader()} className="mt-6 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white">
            {t('myBooks.readerRetry')}
          </button>
        ) : null}
      </ReaderStateShell>
    )
  }

  const isSignatureVoice = isSignatureVoicePackage(reader.latestPackageType)

  if (!reader.finalReady) {
    return (
      <ReaderStateShell backLabel={t('myBooks.readerBack')}>
        <Clock3 className="h-10 w-10 text-amber-600" />
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.08em] text-amber-700">{t('myBooks.readerEyebrow')}</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-gray-900">{resolvedTitle}</h1>
        <h2 className="mt-6 text-lg font-semibold text-gray-800">{t('myBooks.readerPreparingTitle')}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">{t('myBooks.readerPreparingBody')}</p>
        {isSignatureVoice ? <SignatureVoiceEditionNotice variant="postPurchase" className="mt-5 w-full max-w-md" /> : null}
        {reader.latestOrderDisplayId ? <p className="mt-3 text-xs font-medium text-gray-400">{t('myBooks.orderLabel', { orderId: reader.latestOrderDisplayId })}</p> : null}
        <div className="mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={() => void loadReader({ silent: true })} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {t('myBooks.readerRefresh')}
          </button>
          <button type="button" onClick={() => void handleBuyAgain()} disabled={checkoutPending} className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            {checkoutPending ? t('myBooks.readerStartingCheckout') : t('myBooks.readerBuyAgain')}
          </button>
        </div>
        {checkoutError ? <p role="alert" className="mt-4 text-sm font-medium text-red-700">{checkoutError}</p> : null}
      </ReaderStateShell>
    )
  }

  const renderPageContent = (side: 'left' | 'right', spreadIndex: number) => (
    <PreviewBookPageContent
      mode="reader"
      controls={false}
      side={side}
      spreadIndex={spreadIndex}
      previewImageErrors={imageErrors}
      bookPresentation={visiblePresentation}
      currentSpread={currentSpread}
      isFlipping={isFlipping}
      resolvedTitle={resolvedTitle}
      labels={{
        previewAlt: resolvedTitle,
        previewPageStillCreating: t('myBooks.readerPageUnavailable'),
        previewPageLocked: '',
        backToCover: t('personalize.backToCover'),
        nextPage: t('personalize.nextPage'),
        previousPage: t('personalize.previousPage'),
      }}
      canTurnNext={currentSpread < maxSpreadIndex}
      canTurnPrev={currentSpread > 0}
      onImageError={handleImageError}
      onTurnPage={turnPage}
      onReturnToCover={returnToCover}
    />
  )

  return (
    <div className="page-surface min-h-screen overflow-x-hidden px-3 pb-16 pt-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Link href="/my-books?shelf=purchased" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" />
          {t('myBooks.readerBack')}
        </Link>

        <header className="mx-auto mb-8 mt-8 max-w-2xl text-center md:mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-amber-700">{t('myBooks.readerEyebrow')}</p>
          <h1 className="mt-3 font-display text-2xl font-semibold text-gray-900 md:text-3xl">{resolvedTitle}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('myBooks.readerFullBook')}</p>
          {isSignatureVoice ? <SignatureVoiceEditionNotice variant="postPurchase" compact className="mx-auto mt-5 max-w-xl" /> : null}
        </header>

        <PreviewBookShell
          ariaLabel={resolvedTitle}
          coverUrl={decodedCover.url}
          ready={decodedCover.isReady}
          waitingLeft={null}
          waitingRight={<p className="p-8 text-center text-sm text-gray-500">{t('myBooks.readerPageUnavailable')}</p>}
          currentSpread={currentSpread}
          transition={navigation.transition}
          maxSpread={maxSpreadIndex}
          renderPage={renderPageContent}
          onTurn={turnPage}
          onCover={returnToCover}
          onComplete={navigation.complete}
        />

        <div className="mx-auto mt-3 flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-xs font-medium text-gray-400">{currentSpread === 0 ? t('myBooks.readyBadge') : `${currentSpread} / ${maxSpreadIndex}`}</p>
          <button type="button" onClick={() => void handleBuyAgain()} disabled={checkoutPending} className="inline-flex min-w-40 items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            {checkoutPending ? t('myBooks.readerStartingCheckout') : t('myBooks.readerBuyAgain')}
          </button>
          {checkoutError ? <p role="alert" className="text-sm font-medium text-red-700">{checkoutError}</p> : null}
        </div>
      </div>
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
        <Link href="/my-books?shelf=purchased" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 transition hover:text-gray-900">
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
