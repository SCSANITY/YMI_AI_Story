'use client'

import { AudioLines, Volume2 } from 'lucide-react'
import { useI18n } from '@/lib/useI18n'

type SignatureVoiceEditionNoticeProps = {
  variant: 'preview' | 'checkout' | 'postPurchase'
  compact?: boolean
  className?: string
}

export function SignatureVoiceBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n()

  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-2.5 py-1 text-[11px] font-semibold text-amber-800 shadow-sm ${className}`}>
      <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
      {t('signatureVoice.badge')}
    </span>
  )
}

export function SignatureVoiceEditionNotice({
  variant,
  compact = false,
  className = '',
}: SignatureVoiceEditionNoticeProps) {
  const { t } = useI18n()
  const titleKey = variant === 'preview'
    ? 'signatureVoice.previewTitle'
    : variant === 'checkout'
      ? 'signatureVoice.checkoutTitle'
      : 'signatureVoice.postPurchaseTitle'
  const bodyKey = variant === 'preview'
    ? 'signatureVoice.previewBody'
    : variant === 'checkout'
      ? 'signatureVoice.checkoutBody'
      : 'signatureVoice.postPurchaseBody'

  return (
    <aside
      className={`flex items-start gap-3 rounded-lg border border-amber-200/70 bg-white/65 text-left shadow-[0_8px_26px_rgba(180,118,25,0.08)] backdrop-blur-xl ${
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5'
      } ${className}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
        <AudioLines className={compact ? 'h-4 w-4' : 'h-[18px] w-[18px]'} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">{t(titleKey)}</div>
        <p className={`text-gray-600 ${compact ? 'mt-0.5 text-xs leading-5' : 'mt-1 text-sm leading-6'}`}>
          {t(bodyKey)}
        </p>
      </div>
    </aside>
  )
}
