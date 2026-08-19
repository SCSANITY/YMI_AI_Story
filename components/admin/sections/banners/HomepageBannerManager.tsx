'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeftRight,
  Eye,
  EyeOff,
  ImageUp,
  Loader2,
  Monitor,
  RefreshCw,
  Save,
  Smartphone,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  HOMEPAGE_BANNER_SLOT_KEYS,
  type AdminHomepageBannerAsset,
  type AdminHomepageBannerSlot,
  type HomepageBannerSlotKey,
} from '@/lib/homepage-banners-core'
import {
  AdminButton,
  AdminNotice,
  AdminPanel,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
} from '@/components/admin/AdminUi'

type Viewport = 'desktop' | 'mobile'

const SLOT_LABELS: Record<HomepageBannerSlotKey, { title: string; description: string }> = {
  after_hero: {
    title: 'After Hero',
    description: 'The first full-width banner below the opening experience.',
  },
  after_for_boys: {
    title: 'After For Boys',
    description: 'Placed between the For Boys and For Girls collections.',
  },
  after_in_discount: {
    title: 'After In Discount',
    description: 'The final banner before the footer.',
  },
}

function isAdminBannerSlot(value: unknown): value is AdminHomepageBannerSlot {
  if (!value || typeof value !== 'object') return false
  const slot = value as Partial<AdminHomepageBannerSlot>
  return (
    HOMEPAGE_BANNER_SLOT_KEYS.includes(slot.slotKey as HomepageBannerSlotKey) &&
    typeof slot.displayName === 'string' &&
    typeof slot.rowVersion === 'number' &&
    Boolean(slot.desktop?.src) &&
    Boolean(slot.mobile?.src)
  )
}

function snapshot(slot: AdminHomepageBannerSlot) {
  return JSON.stringify({
    displayName: slot.displayName,
    desktop: {
      source: slot.desktop.source,
      path: slot.desktop.path,
      width: slot.desktop.width,
      height: slot.desktop.height,
    },
    mobile: {
      source: slot.mobile.source,
      path: slot.mobile.path,
      width: slot.mobile.width,
      height: slot.mobile.height,
    },
    altText: slot.altText,
    href: slot.href,
    isVisible: slot.isVisible,
  })
}

function qualityWarnings(asset: AdminHomepageBannerAsset, viewport: Viewport) {
  const recommendedWidth = viewport === 'desktop' ? 1920 : 1080
  return asset.width < recommendedWidth
    ? [`Below the recommended ${recommendedWidth}px ${viewport} width.`]
    : []
}

async function readImageDimensions(file: File) {
  if ('createImageBitmap' in window) {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('Unable to read image dimensions.'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

function AssetEditor({
  viewport,
  asset,
  uploading,
  onUpload,
}: {
  viewport: Viewport
  asset: AdminHomepageBannerAsset
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const Icon = viewport === 'desktop' ? Monitor : Smartphone
  const recommended = viewport === 'desktop' ? '1920px+ wide' : '1080px+ wide'
  const inputId = `homepage-banner-${viewport}-upload`
  const warnings = qualityWarnings(asset, viewport)

  return (
    <div className="rounded-xl bg-[var(--admin-page-soft)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[var(--admin-accent-dp)] shadow-sm">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold capitalize text-[var(--admin-page-ink)]">{viewport}</p>
            <p className="mt-0.5 text-xs text-[var(--admin-page-muted)]">Recommended: {recommended}</p>
          </div>
        </div>
        <label
          htmlFor={inputId}
          className={`admin-v2-button admin-v2-button--secondary cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
          Replace
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/webp,image/png,image/jpeg"
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ''
            if (file) onUpload(file)
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <AdminStatusBadge tone="neutral">{asset.width} x {asset.height}</AdminStatusBadge>
        <AdminStatusBadge tone="neutral">{(asset.width / asset.height).toFixed(2)}:1</AdminStatusBadge>
        <AdminStatusBadge tone={asset.source === 'storage' ? 'success' : 'info'}>
          {asset.source === 'storage' ? 'Uploaded asset' : 'Built-in asset'}
        </AdminStatusBadge>
      </div>
      {warnings.map((warning) => (
        <p key={warning} className="mt-2 text-xs font-semibold text-amber-700">{warning}</p>
      ))}
    </div>
  )
}

function BannerPreview({
  slot,
  viewport,
  onViewportChange,
}: {
  slot: AdminHomepageBannerSlot
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
}) {
  const asset = slot[viewport]
  return (
    <AdminPanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div>
          <p className="text-sm font-bold text-[var(--admin-page-ink)]">Published-output preview</p>
          <p className="mt-0.5 text-xs text-[var(--admin-page-muted)]">
            Uses this viewport&apos;s own image ratio with no frame on Home.
          </p>
        </div>
        <div className="flex rounded-lg bg-[var(--admin-page-soft)] p-1" role="tablist" aria-label="Banner preview viewport">
          {(['desktop', 'mobile'] as Viewport[]).map((candidate) => {
            const Icon = candidate === 'desktop' ? Monitor : Smartphone
            return (
              <button
                key={candidate}
                type="button"
                role="tab"
                aria-selected={viewport === candidate}
                onClick={() => onViewportChange(candidate)}
                className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-bold capitalize transition ${
                  viewport === candidate
                    ? 'bg-white text-[var(--admin-page-ink)] shadow-sm'
                    : 'text-[var(--admin-page-muted)] hover:text-[var(--admin-page-ink)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {candidate}
              </button>
            )
          })}
        </div>
      </div>
      <div className="bg-slate-950/95 p-3 sm:p-5">
        <div className={viewport === 'mobile' ? 'mx-auto w-full max-w-[390px]' : 'w-full'}>
          <div
            className="relative w-full overflow-hidden bg-black"
            style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
          >
            {/* Direct public assets intentionally avoid the Vercel image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.src} alt={slot.altText} className="block h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </AdminPanel>
  )
}

export function HomepageBannerManager() {
  const [slots, setSlots] = useState<AdminHomepageBannerSlot[]>([])
  const [baseline, setBaseline] = useState<AdminHomepageBannerSlot[]>([])
  const [selectedSlotKey, setSelectedSlotKey] = useState<HomepageBannerSlotKey>('after_hero')
  const [previewViewport, setPreviewViewport] = useState<Viewport>('desktop')
  const [swapTarget, setSwapTarget] = useState<HomepageBannerSlotKey>('after_for_boys')
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [uploading, setUploading] = useState<Record<Viewport, boolean>>({ desktop: false, mobile: false })
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning' | 'danger' | 'info'; text: string } | null>(null)
  const loadIntentRef = useRef(0)
  const publishIntentRef = useRef(0)
  const uploadIntentRef = useRef<Record<Viewport, number>>({ desktop: 0, mobile: 0 })
  const objectUrlsRef = useRef(new Map<string, string>())

  const loadSlots = useCallback(async () => {
    const intent = ++loadIntentRef.current
    setLoading(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/homepage-banners', {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load Homepage banners')
      if (loadIntentRef.current !== intent) return
      const nextSlots = Array.isArray(data?.slots) ? data.slots.filter(isAdminBannerSlot) : []
      setSlots(nextSlots)
      setBaseline(nextSlots)
    } catch (error) {
      if (loadIntentRef.current !== intent) return
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Failed to load Homepage banners' })
    } finally {
      if (loadIntentRef.current === intent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const uploadIntents = uploadIntentRef.current
    const objectUrls = objectUrlsRef.current
    void loadSlots()
    return () => {
      loadIntentRef.current += 1
      publishIntentRef.current += 1
      uploadIntents.desktop += 1
      uploadIntents.mobile += 1
      for (const url of objectUrls.values()) URL.revokeObjectURL(url)
      objectUrls.clear()
    }
  }, [loadSlots])

  const selectedSlot = slots.find((slot) => slot.slotKey === selectedSlotKey) ?? null
  const selectedBaseline = baseline.find((slot) => slot.slotKey === selectedSlotKey) ?? null
  const isDirty = Boolean(selectedSlot && selectedBaseline && snapshot(selectedSlot) !== snapshot(selectedBaseline))
  const hasAnyDirty = slots.some((slot) => {
    const original = baseline.find((candidate) => candidate.slotKey === slot.slotKey)
    return !original || snapshot(slot) !== snapshot(original)
  })

  const updateSelected = (updater: (slot: AdminHomepageBannerSlot) => AdminHomepageBannerSlot) => {
    setSlots((current) => current.map((slot) => (
      slot.slotKey === selectedSlotKey ? updater(slot) : slot
    )))
    setFeedback(null)
  }

  const handleUpload = async (viewport: Viewport, file: File) => {
    if (!selectedSlot || uploading[viewport]) return
    const intent = ++uploadIntentRef.current[viewport]
    setUploading((current) => ({ ...current, [viewport]: true }))
    setFeedback(null)
    try {
      if (!['image/webp', 'image/png', 'image/jpeg'].includes(file.type)) {
        throw new Error('Use a WebP, PNG, or JPEG image.')
      }
      if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
        throw new Error('Banner images must be no larger than 5 MB.')
      }
      const dimensions = await readImageDimensions(file)
      if (dimensions.width / dimensions.height < 1.5) {
        throw new Error('This image is too tall. Use a landscape ratio of at least 1.5:1.')
      }

      const response = await fetch('/api/admin/homepage-banners/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      })
      const spec = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(spec?.error || 'Failed to prepare Banner upload')

      const { error } = await supabase.storage
        .from(spec.bucket)
        .uploadToSignedUrl(spec.storagePath, spec.token, file, { contentType: file.type })
      if (error) throw new Error(error.message || 'Failed to upload Banner image')
      if (uploadIntentRef.current[viewport] !== intent) return

      const previewUrl = URL.createObjectURL(file)
      const previewKey = `${selectedSlot.slotKey}:${viewport}`
      const previousPreviewUrl = objectUrlsRef.current.get(previewKey)
      if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl)
      objectUrlsRef.current.set(previewKey, previewUrl)
      updateSelected((slot) => ({
        ...slot,
        [viewport]: {
          source: 'storage',
          path: spec.storagePath,
          src: previewUrl,
          width: dimensions.width,
          height: dimensions.height,
        },
      }))
      setPreviewViewport(viewport)
      const recommendedWidth = viewport === 'desktop' ? 1920 : 1080
      setFeedback({
        tone: dimensions.width < recommendedWidth ? 'warning' : 'success',
        text: dimensions.width < recommendedWidth
          ? `Uploaded for preview. Width is below the recommended ${recommendedWidth}px; review before publishing.`
          : `${viewport === 'desktop' ? 'Desktop' : 'Mobile'} image uploaded for preview. Publish when ready.`,
      })
    } catch (error) {
      if (uploadIntentRef.current[viewport] !== intent) return
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Banner upload failed' })
    } finally {
      if (uploadIntentRef.current[viewport] === intent) {
        setUploading((current) => ({ ...current, [viewport]: false }))
      }
    }
  }

  const publish = async () => {
    if (!selectedSlot || !isDirty || publishing || uploading.desktop || uploading.mobile) return
    const intent = ++publishIntentRef.current
    setPublishing(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/homepage-banners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slotKey: selectedSlot.slotKey,
          expectedVersion: selectedSlot.rowVersion,
          displayName: selectedSlot.displayName,
          desktop: { source: selectedSlot.desktop.source, path: selectedSlot.desktop.path },
          mobile: { source: selectedSlot.mobile.source, path: selectedSlot.mobile.path },
          altText: selectedSlot.altText,
          href: selectedSlot.href,
          isVisible: selectedSlot.isVisible,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !isAdminBannerSlot(data?.slot)) {
        throw new Error(data?.error || 'Failed to publish Homepage banner')
      }
      if (publishIntentRef.current !== intent) return
      setSlots((current) => current.map((slot) => slot.slotKey === data.slot.slotKey ? data.slot : slot))
      setBaseline((current) => current.map((slot) => slot.slotKey === data.slot.slotKey ? data.slot : slot))
      setFeedback({ tone: 'success', text: 'Homepage Banner published.' })
    } catch (error) {
      if (publishIntentRef.current !== intent) return
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Failed to publish Homepage banner' })
    } finally {
      if (publishIntentRef.current === intent) setPublishing(false)
    }
  }

  const swap = async () => {
    if (!selectedSlot || swapTarget === selectedSlot.slotKey || hasAnyDirty || swapping) return
    const target = slots.find((slot) => slot.slotKey === swapTarget)
    if (!target) return
    setSwapping(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/admin/homepage-banners/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstSlotKey: selectedSlot.slotKey,
          firstExpectedVersion: selectedSlot.rowVersion,
          secondSlotKey: target.slotKey,
          secondExpectedVersion: target.rowVersion,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to swap Banner positions')
      const nextSlots = Array.isArray(data?.slots) ? data.slots.filter(isAdminBannerSlot) : []
      setSlots(nextSlots)
      setBaseline(nextSlots)
      setFeedback({ tone: 'success', text: 'Banner positions swapped.' })
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Failed to swap Banner positions' })
    } finally {
      setSwapping(false)
    }
  }

  if (loading && slots.length === 0) {
    return (
      <AdminPanel className="grid min-h-56 place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--admin-accent-dp)]" aria-label="Loading Homepage banners" />
      </AdminPanel>
    )
  }

  return (
    <div className="space-y-4">
      {feedback ? <AdminNotice tone={feedback.tone}>{feedback.text}</AdminNotice> : null}

      <div className="grid gap-3 lg:grid-cols-3" role="tablist" aria-label="Homepage Banner positions">
        {HOMEPAGE_BANNER_SLOT_KEYS.map((slotKey) => {
          const slot = slots.find((candidate) => candidate.slotKey === slotKey)
          const selected = selectedSlotKey === slotKey
          return (
            <button
              key={slotKey}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setSelectedSlotKey(slotKey)
                setSwapTarget(HOMEPAGE_BANNER_SLOT_KEYS.find((key) => key !== slotKey) ?? 'after_hero')
                setFeedback(null)
              }}
              className={`min-w-0 rounded-xl p-4 text-left transition ${
                selected
                  ? 'bg-[var(--admin-page-ink)] text-white shadow-lg'
                  : 'admin-v2-panel hover:-translate-y-0.5'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${selected ? 'text-white/55' : 'text-[var(--admin-page-muted)]'}`}>
                    {SLOT_LABELS[slotKey].title}
                  </p>
                  <p className={`mt-2 truncate text-sm font-bold ${selected ? 'text-white' : 'text-[var(--admin-page-ink)]'}`}>
                    {slot?.displayName || 'Unavailable'}
                  </p>
                </div>
                {slot?.isVisible ? <Eye className="h-4 w-4 shrink-0" /> : <EyeOff className="h-4 w-4 shrink-0" />}
              </div>
              <p className={`mt-2 text-xs leading-5 ${selected ? 'text-white/65' : 'text-[var(--admin-page-muted)]'}`}>
                {SLOT_LABELS[slotKey].description}
              </p>
            </button>
          )
        })}
      </div>

      {!selectedSlot ? (
        <AdminNotice tone="danger">The selected Banner slot could not be loaded.</AdminNotice>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(19rem,0.72fr)_minmax(0,1.28fr)] xl:items-start">
          <AdminPanel className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-page-muted)]">
                  {SLOT_LABELS[selectedSlot.slotKey].title}
                </p>
                <h2 className="mt-1 text-xl font-bold text-[var(--admin-page-ink)]">Banner settings</h2>
              </div>
              <AdminStatusBadge tone={selectedSlot.isVisible ? 'success' : 'warning'}>
                {selectedSlot.isVisible ? 'Visible' : 'Hidden'}
              </AdminStatusBadge>
            </div>

            <label className={adminLabelClass}>
              Internal name
              <input
                className={adminFieldClass}
                value={selectedSlot.displayName}
                maxLength={120}
                onChange={(event) => updateSelected((slot) => ({ ...slot, displayName: event.target.value }))}
              />
            </label>
            <label className={adminLabelClass}>
              Alternative text
              <textarea
                className={`${adminFieldClass} min-h-24 py-2.5`}
                value={selectedSlot.altText}
                maxLength={240}
                onChange={(event) => updateSelected((slot) => ({ ...slot, altText: event.target.value }))}
              />
            </label>
            <label className={adminLabelClass}>
              Internal destination
              <input
                className={adminFieldClass}
                value={selectedSlot.href}
                placeholder="/books"
                onChange={(event) => updateSelected((slot) => ({ ...slot, href: event.target.value }))}
              />
            </label>

            <button
              type="button"
              role="switch"
              aria-checked={selectedSlot.isVisible}
              onClick={() => updateSelected((slot) => ({ ...slot, isVisible: !slot.isVisible }))}
              className="flex w-full items-center justify-between gap-4 rounded-xl bg-[var(--admin-page-soft)] px-4 py-3 text-left"
            >
              <span>
                <span className="block text-sm font-bold text-[var(--admin-page-ink)]">Show on Home</span>
                <span className="mt-0.5 block text-xs text-[var(--admin-page-muted)]">Hidden slots leave no empty spacer.</span>
              </span>
              <span className={`relative h-6 w-11 rounded-full transition ${selectedSlot.isVisible ? 'bg-[var(--admin-accent-dp)]' : 'bg-slate-300'}`}>
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${selectedSlot.isVisible ? 'left-6' : 'left-1'}`} />
              </span>
            </button>

            <div className="space-y-3">
              <AssetEditor
                viewport="desktop"
                asset={selectedSlot.desktop}
                uploading={uploading.desktop}
                onUpload={(file) => void handleUpload('desktop', file)}
              />
              <AssetEditor
                viewport="mobile"
                asset={selectedSlot.mobile}
                uploading={uploading.mobile}
                onUpload={(file) => void handleUpload('mobile', file)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <AdminButton
                tone="primary"
                className="flex-1"
                disabled={!isDirty || publishing || uploading.desktop || uploading.mobile}
                onClick={() => void publish()}
              >
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Publish changes
              </AdminButton>
              <AdminButton
                disabled={!isDirty || publishing}
                onClick={() => {
                  if (!selectedBaseline) return
                  setSlots((current) => current.map((slot) => slot.slotKey === selectedSlotKey ? selectedBaseline : slot))
                  setFeedback(null)
                }}
              >
                Reset draft
              </AdminButton>
            </div>

            <div className="border-t border-[var(--admin-page-line)] pt-5">
              <p className="text-sm font-bold text-[var(--admin-page-ink)]">Swap complete Banner positions</p>
              <p className="mt-1 text-xs leading-5 text-[var(--admin-page-muted)]">
                Desktop, Mobile, text, link, and visibility move together in one publish transaction.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <select
                  className={`${adminFieldClass} mt-0 flex-1`}
                  value={swapTarget}
                  onChange={(event) => setSwapTarget(event.target.value as HomepageBannerSlotKey)}
                >
                  {HOMEPAGE_BANNER_SLOT_KEYS.filter((key) => key !== selectedSlot.slotKey).map((key) => (
                    <option key={key} value={key}>{SLOT_LABELS[key].title}</option>
                  ))}
                </select>
                <AdminButton
                  tone="dark"
                  disabled={hasAnyDirty || swapping || swapTarget === selectedSlot.slotKey}
                  onClick={() => void swap()}
                >
                  {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                  Swap
                </AdminButton>
              </div>
              {hasAnyDirty ? (
                <p className="mt-2 text-xs font-semibold text-amber-700">Publish or reset all drafts before swapping positions.</p>
              ) : null}
            </div>
          </AdminPanel>

          <div className="space-y-4 xl:sticky xl:top-4">
            <BannerPreview slot={selectedSlot} viewport={previewViewport} onViewportChange={setPreviewViewport} />
            {selectedSlot.warnings.length > 0 ? (
              <AdminNotice tone="warning">
                {selectedSlot.warnings.join(' ')} These are quality recommendations, not publishing blockers.
              </AdminNotice>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <AdminButton disabled={loading} onClick={() => void loadSlots()}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </AdminButton>
      </div>
    </div>
  )
}
