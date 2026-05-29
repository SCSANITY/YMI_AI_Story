'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, Download, Image as ImageIcon, Share2, X } from 'lucide-react'
import { useI18n } from '@/lib/useI18n'

type ShareDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description: string
  shareUrl: string
  shareText: string
  editableShareText?: boolean
  includeTextInShareUrl?: boolean
  previewImageUrl?: string | null
  code?: string | null
  note?: string | null
}

function openPopup(url: string) {
  if (typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer,width=720,height=720')
}

function buildTextAwareShareUrl(shareUrl: string, shareText: string) {
  if (!shareText.trim()) return shareUrl
  try {
    const url = new URL(shareUrl)
    url.searchParams.set('caption', shareText.trim())
    return url.toString()
  } catch {
    return shareUrl
  }
}

async function fetchShareImageFile(imageUrl: string) {
  const response = await fetch(imageUrl)
  if (!response.ok) return null

  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) return null

  const extension = blob.type.includes('png')
    ? 'png'
    : blob.type.includes('webp')
      ? 'webp'
      : 'jpg'

  return new File([blob], `ymi-story-preview.${extension}`, { type: blob.type || 'image/jpeg' })
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.738l7.73-8.835L1.254 2.25H8.08l4.256 5.628 5.908-5.628zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

export function ShareDialog({
  open,
  onClose,
  title,
  description,
  shareUrl,
  shareText,
  editableShareText = false,
  includeTextInShareUrl = false,
  previewImageUrl = null,
  code = null,
  note = null,
}: ShareDialogProps) {
  const { t } = useI18n()
  const [copyLinkState, setCopyLinkState] = useState<'idle' | 'copied'>('idle')
  const [copyTextState, setCopyTextState] = useState<'idle' | 'copied'>('idle')
  const [draftShareText, setDraftShareText] = useState(shareText)
  const [isLinkExpanded, setIsLinkExpanded] = useState(false)
  const [isImageSharing, setIsImageSharing] = useState(false)
  const [imageShareState, setImageShareState] = useState<'idle' | 'unavailable'>('idle')
  const imageFileCacheRef = useRef<{ url: string; file: File } | null>(null)

  const canNativeShare =
    typeof window !== 'undefined' &&
    typeof (navigator as Navigator & { share?: Navigator['share'] }).share === 'function'

  useEffect(() => {
    if (!open) return
    setDraftShareText(shareText)
    setCopyLinkState('idle')
    setCopyTextState('idle')
    setIsLinkExpanded(false)
    setImageShareState('idle')
  }, [open, shareText])

  const getShareImageFile = useCallback(async () => {
    if (!previewImageUrl) return null
    if (imageFileCacheRef.current?.url === previewImageUrl) {
      return imageFileCacheRef.current.file
    }

    const file = await fetchShareImageFile(previewImageUrl)
    if (file) {
      imageFileCacheRef.current = { url: previewImageUrl, file }
    }
    return file
  }, [previewImageUrl])

  useEffect(() => {
    if (!open || !previewImageUrl) {
      imageFileCacheRef.current = null
      return
    }

    let isActive = true
    const timer = window.setTimeout(() => {
      void getShareImageFile().then((file) => {
        if (!isActive || !file) return
      })
    }, 250)

    return () => {
      isActive = false
      window.clearTimeout(timer)
    }
  }, [getShareImageFile, open, previewImageUrl])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  const effectiveShareText = editableShareText ? draftShareText : shareText
  const effectiveShareUrl = useMemo(
    () => includeTextInShareUrl ? buildTextAwareShareUrl(shareUrl, effectiveShareText) : shareUrl,
    [effectiveShareText, includeTextInShareUrl, shareUrl]
  )
  const fullShareText = useMemo(
    () => `${effectiveShareText}\n${effectiveShareUrl}`.trim(),
    [effectiveShareText, effectiveShareUrl]
  )

  if (!open || typeof document === 'undefined') return null

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(effectiveShareUrl)
      setCopyLinkState('copied')
      window.setTimeout(() => setCopyLinkState('idle'), 1800)
    } catch { /* no-op */ }
  }

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(fullShareText)
      setCopyTextState('copied')
      window.setTimeout(() => setCopyTextState('idle'), 1800)
    } catch { /* no-op */ }
  }

  const handleNativeShare = async () => {
    if (!navigator.share) return
    try { await navigator.share({ title, text: effectiveShareText, url: effectiveShareUrl }) } catch { /* user cancelled */ }
  }

  const handleNativeShareWithImage = async () => {
    if (!navigator.share || !previewImageUrl) return
    setIsImageSharing(true)
    setImageShareState('idle')

    try {
      const file = await getShareImageFile()
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
      }

      if (file && nav.canShare?.({ files: [file] })) {
        await navigator.share({
          title,
          text: fullShareText,
          files: [file],
        })
        return
      }

      await navigator.share({ title, text: effectiveShareText, url: effectiveShareUrl })
      setImageShareState('unavailable')
    } catch {
      // User cancellation or platform rejection should not close the dialog.
    } finally {
      setIsImageSharing(false)
    }
  }

  const handleDownloadImage = async () => {
    if (!previewImageUrl || typeof document === 'undefined') return

    try {
      const file = await getShareImageFile()
      const blob = file ?? await fetch(previewImageUrl).then((response) => response.ok ? response.blob() : null)
      if (!blob) throw new Error('Image download failed')
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = file?.name || 'ymi-story-preview.jpg'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      openPopup(previewImageUrl)
    }
  }

  const platforms = [
    {
      id: 'facebook',
      label: 'Facebook',
      colorCls: 'bg-[#1877F2]/90 hover:bg-[#1877F2] border-[#1877F2]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]',
      icon: <FacebookIcon className="h-5 w-5 shrink-0" />,
      action: () => openPopup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(effectiveShareUrl)}`),
    },
    {
      id: 'x',
      label: 'Share link on X',
      colorCls: 'bg-black/80 hover:bg-black/90 border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
      icon: <XIcon className="h-5 w-5 shrink-0" />,
      action: () =>
        openPopup(
          `https://twitter.com/intent/tweet?text=${encodeURIComponent(effectiveShareText)}&url=${encodeURIComponent(effectiveShareUrl)}`
        ),
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      colorCls: 'bg-[#25D366]/90 hover:bg-[#25D366] border-[#25D366]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]',
      icon: <WhatsAppIcon className="h-5 w-5 shrink-0" />,
      action: () => openPopup(`https://wa.me/?text=${encodeURIComponent(fullShareText)}`),
    },
    {
      id: 'instagram',
      label: 'Open Instagram',
      colorCls: 'border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]',
      style: { background: 'linear-gradient(135deg, #f09433cc 0%, #e6683ccc 25%, #dc2743cc 50%, #cc2366cc 75%, #bc1888cc 100%)' },
      icon: <InstagramIcon className="h-5 w-5 shrink-0" />,
      action: async () => {
        await handleCopyText()
        openPopup('https://www.instagram.com/')
      },
    },
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center overflow-y-auto p-3 backdrop-blur-sm sm:p-4"
      style={{ background: 'rgba(15,23,42,0.38)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Glass card */}
      <div className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white/78 shadow-[0_24px_64px_rgba(15,23,42,0.22),inset_0_1px_0_rgba(255,255,255,0.9)] sm:max-h-[calc(100vh-2rem)]"
        style={{ backdropFilter: 'blur(28px) saturate(160%)' }}
      >

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/50 px-6 py-5">
          <div>
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/50 text-slate-400 backdrop-blur-sm transition hover:bg-white/80 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">

          {/* Preview image */}
          {previewImageUrl ? (
            <div className="flex justify-center px-2 pb-1 pt-2">
              <div className="book-cover-motion relative w-full max-w-[250px]">
                {/* Shared previews may be signed Supabase URLs or generated route images; keep native img to avoid Next image proxy caching expired URLs. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewImageUrl}
                  alt={title}
                  decoding="async"
                  loading="eager"
                  fetchPriority="high"
                  className="book-cover-img block w-full select-none drop-shadow-[8px_20px_34px_rgba(92,43,10,0.28)]"
                />
                <div aria-hidden="true" className="card-ripple-ring" />
              </div>
            </div>
          ) : null}

          {(canNativeShare || previewImageUrl) ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {canNativeShare ? (
                <button
                  type="button"
                  onClick={() => void handleNativeShareWithImage()}
                  disabled={isImageSharing || !previewImageUrl}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200/70 bg-white/55 px-3 text-xs font-bold text-amber-700 backdrop-blur-sm transition hover:border-amber-300 hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {isImageSharing ? t('common.loading') : 'Share image'}
                </button>
              ) : null}
              {previewImageUrl ? (
                <button
                  type="button"
                  onClick={() => void handleDownloadImage()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/65 bg-white/55 px-3 text-xs font-bold text-slate-600 backdrop-blur-sm transition hover:border-amber-300/60 hover:bg-white/80 hover:text-amber-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download image
                </button>
              ) : null}
              {imageShareState === 'unavailable' ? (
                <p className="text-[11px] leading-5 text-slate-400 sm:col-span-2">
                  This device shared the link only. Download the image if your app needs a manual upload.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Code badge */}
          {code ? (
            <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/80 to-orange-50/80 px-4 py-3 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">
                {t('share.yourCode')}
              </p>
              <p className="mt-1.5 font-mono text-xl font-black tracking-[0.22em] text-gray-900">{code}</p>
            </div>
          ) : null}

          {/* Promotional copy preview */}
          <div className="rounded-2xl border border-white/55 bg-white/45 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
            style={{ backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                {t('share.copyPreviewLabel')}
              </p>
              <button
                type="button"
                onClick={() => void handleCopyText()}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-2.5 text-[11px] font-semibold text-slate-600 backdrop-blur-sm transition hover:border-amber-300/70 hover:bg-white/80 hover:text-amber-700"
              >
                {copyTextState === 'copied'
                  ? <Check className="h-3 w-3 text-emerald-500" />
                  : <Copy className="h-3 w-3" />}
                {copyTextState === 'copied' ? t('share.linkCopied') : t('share.copyAll')}
              </button>
            </div>
            {editableShareText ? (
              <textarea
                value={draftShareText}
                onChange={(event) => setDraftShareText(event.target.value)}
                rows={5}
                maxLength={480}
                className="mt-2 w-full resize-none rounded-xl border border-white/70 bg-white/55 px-3 py-2 text-sm leading-6 text-gray-700 outline-none transition focus:border-amber-300 focus:bg-white/80 focus:ring-2 focus:ring-amber-200/60"
              />
            ) : (
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">{effectiveShareText}</p>
            )}
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setIsLinkExpanded((current) => !current)}
                className={`block w-full text-left text-xs font-medium text-amber-600 transition hover:text-amber-700 ${
                  isLinkExpanded ? 'break-all' : 'truncate'
                }`}
                title={isLinkExpanded ? undefined : effectiveShareUrl}
              >
                {effectiveShareUrl}
              </button>
            </div>
          </div>

          {/* Platform buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void p.action()}
                className={`inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl border text-sm font-bold text-white backdrop-blur-sm transition active:scale-[0.97] ${'style' in p ? p.colorCls : p.colorCls}`}
                style={'style' in p ? p.style : undefined}
              >
                {p.icon}
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Link row */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLinkExpanded((current) => !current)}
              className={`min-w-0 flex-1 rounded-xl border border-white/55 bg-white/40 px-3 py-2.5 text-left text-xs text-slate-400 backdrop-blur-sm transition hover:border-amber-200 hover:bg-white/55 hover:text-amber-700 ${
                isLinkExpanded ? 'basis-full break-all' : 'truncate'
              }`}
              title={isLinkExpanded ? undefined : effectiveShareUrl}
            >
              {effectiveShareUrl}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/65 bg-white/55 px-3 text-xs font-semibold text-slate-600 backdrop-blur-sm transition hover:border-amber-300/60 hover:bg-white/75 hover:text-amber-700"
            >
              {copyLinkState === 'copied' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copyLinkState === 'copied' ? t('share.linkCopied') : t('share.copyLink')}
            </button>
            {canNativeShare ? (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-white/65 bg-white/55 px-3 text-xs font-semibold text-slate-600 backdrop-blur-sm transition hover:border-amber-300/60 hover:bg-white/75 hover:text-amber-700"
              >
                <Share2 className="h-3.5 w-3.5" />
                {t('share.systemShare')}
              </button>
            ) : null}
          </div>

          {/* Footer notes */}
          {note ? <p className="text-xs leading-5 text-slate-400">{note}</p> : null}
          <p className="text-[11px] leading-5 text-slate-400">{t('share.instagramHint')}</p>

        </div>
      </div>
    </div>,
    document.body
  )
}
