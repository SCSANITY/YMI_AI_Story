'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, ExternalLink, Share2, X } from 'lucide-react'
import { Button } from '@/components/Button'
import { useI18n } from '@/lib/useI18n'

type ShareDialogProps = {
  open: boolean
  onClose: () => void
  title: string
  description: string
  shareUrl: string
  shareText: string
  previewImageUrl?: string | null
  code?: string | null
  note?: string | null
}

function openPopup(url: string) {
  if (typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer,width=720,height=720')
}

export function ShareDialog({
  open,
  onClose,
  title,
  description,
  shareUrl,
  shareText,
  previewImageUrl = null,
  code = null,
  note = null,
}: ShareDialogProps) {
  const { t } = useI18n()
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')
  const canNativeShare =
    typeof window !== 'undefined' &&
    typeof (navigator as Navigator & { share?: Navigator['share'] }).share === 'function'

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const fullShareText = useMemo(() => `${shareText} ${shareUrl}`.trim(), [shareText, shareUrl])

  if (!open) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullShareText)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch {
      setCopyState('idle')
    }
  }

  const handleNativeShare = async () => {
    if (!navigator.share) return
    try {
      await navigator.share({
        title,
        text: shareText,
        url: shareUrl,
      })
    } catch {
      // User cancelled or platform rejected; no-op.
    }
  }

  const instagramUrl = 'https://www.instagram.com/'

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/45 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="my-3 flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-amber-100 bg-white shadow-2xl sm:my-0 sm:max-h-[calc(100dvh-2rem)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6 sm:py-5">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
          <div className="space-y-4">
            {previewImageUrl ? (
              <img
                src={previewImageUrl}
                alt={title}
                className="w-full rounded-2xl border border-amber-100 bg-amber-50/40 object-cover shadow-sm"
              />
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
                {t('share.imageUnavailable')}
              </div>
            )}

            {code ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  {t('share.yourCode')}
                </div>
                <div className="mt-2 font-mono text-lg font-bold tracking-[0.25em] text-gray-900">
                  {code}
                </div>
              </div>
            ) : null}

            {note ? (
              <p className="text-xs leading-5 text-gray-500">{note}</p>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl h-12 justify-start px-4"
                onClick={() =>
                  openPopup(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
                  )
                }
              >
                Facebook
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl h-12 justify-start px-4"
                onClick={() =>
                  openPopup(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      shareText
                    )}&url=${encodeURIComponent(shareUrl)}`
                  )
                }
              >
                X
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl h-12 justify-start px-4"
                onClick={() =>
                  openPopup(
                    `https://wa.me/?text=${encodeURIComponent(fullShareText)}`
                  )
                }
              >
                WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl h-12 justify-start px-4"
                onClick={async () => {
                  await handleCopy()
                  openPopup(instagramUrl)
                }}
              >
                Instagram
              </Button>
            </div>

            <div className="space-y-3 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                {t('share.shareLink')}
              </div>
              <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs text-gray-600 break-all">
                {shareUrl}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  className="rounded-full"
                  onClick={handleCopy}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copyState === 'copied' ? t('share.linkCopied') : t('share.copyLink')}
                </Button>
                {canNativeShare ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={handleNativeShare}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    {t('share.systemShare')}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => openPopup(shareUrl)}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('share.openPage')}
                </Button>
              </div>
              <p className="text-xs leading-5 text-gray-500">{t('share.instagramHint')}</p>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
