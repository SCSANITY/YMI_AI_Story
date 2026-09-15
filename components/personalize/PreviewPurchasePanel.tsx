'use client'

import { memo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Check, Mic2, ShieldCheck } from 'lucide-react'
import type { PurchasePackageType } from '@/lib/purchase-configuration'

type EditionOption = {
  value: PurchasePackageType
  title: string
  subtitle: string
  image: string
  imageAlt: string
  price: string
  badge?: string
}

type PreviewPurchasePanelProps = {
  value: PurchasePackageType
  options: EditionOption[]
  title: string
  voiceTitle: string
  voiceBody: string
  voiceReadyLabel: string
  addVoiceLabel: string
  changeVoiceLabel: string
  privacyCopy: string
  isSavingEdition: boolean
  editionError: string | null
  voiceReady: boolean
  voiceDurationSeconds: number | null
  actions: ReactNode
  onChange: (value: PurchasePackageType) => void
  onOpenVoice: () => void
}

function PreviewPurchasePanelComponent({
  value,
  options,
  title,
  voiceTitle,
  voiceBody,
  voiceReadyLabel,
  addVoiceLabel,
  changeVoiceLabel,
  privacyCopy,
  isSavingEdition,
  editionError,
  voiceReady,
  voiceDurationSeconds,
  actions,
  onChange,
  onOpenVoice,
}: PreviewPurchasePanelProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())

  return (
    <aside className="flex h-full w-full flex-col rounded-[1.5rem] bg-white p-5 shadow-[0_24px_65px_-48px_rgba(69,44,15,0.6)] sm:p-6 xl:min-h-[680px] xl:p-7">
      <fieldset disabled={isSavingEdition}>
        <legend className="font-serif text-2xl font-bold tracking-[-0.02em] text-slate-950">{title}</legend>
        <div className="mt-4 flex flex-col gap-3" role="radiogroup" aria-busy={isSavingEdition}>
          {options.map((option) => {
            const selected = option.value === value
            const imageFailed = failedImages.has(option.value)
            return (
              <label
                key={option.value}
                className={`relative grid cursor-pointer ${imageFailed ? 'grid-cols-[minmax(0,1fr)_24px]' : 'grid-cols-[86px_minmax(0,1fr)_24px]'} items-center gap-3 rounded-2xl border p-3 transition focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-2 ${
                  selected
                    ? 'border-amber-500 bg-amber-50/70 shadow-[0_12px_28px_-22px_rgba(180,83,9,0.65)]'
                    : 'border-slate-200 bg-white hover:border-amber-300'
                }`}
              >
                <input
                  className="sr-only"
                  type="radio"
                  name="book-edition"
                  value={option.value}
                  checked={selected}
                  onChange={() => onChange(option.value)}
                />
                {!imageFailed ? (
                  <span className="relative block h-[68px] overflow-hidden rounded-xl bg-amber-50">
                    <Image
                      src={option.image}
                      alt={option.imageAlt}
                      fill
                      sizes="86px"
                      className="object-cover"
                      onError={() => setFailedImages((current) => new Set(current).add(option.value))}
                    />
                  </span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-950">{option.title}</span>
                    {option.badge ? (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.09em] text-slate-950">
                        {option.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">{option.subtitle}</span>
                  <span className="mt-1 block text-sm font-extrabold text-slate-950">{option.price}</span>
                </span>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 text-transparent'}`} aria-hidden="true">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {editionError ? <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{editionError}</p> : null}

      {value === 'supreme' ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/55 p-4" aria-labelledby="signature-voice-configuration-title">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 shadow-sm">
              <Mic2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="signature-voice-configuration-title" className="font-bold text-slate-950">{voiceTitle}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{voiceBody}</p>
            </div>
          </div>

          {voiceReady ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Check className="h-4 w-4 text-amber-600" aria-hidden="true" />
                {voiceReadyLabel}
                {voiceDurationSeconds ? ` · ${Math.round(voiceDurationSeconds)}s` : ''}
              </span>
              <button type="button" onClick={onOpenVoice} className="text-sm font-bold text-amber-800 underline underline-offset-2">
                {changeVoiceLabel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenVoice}
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              {addVoiceLabel}
            </button>
          )}

          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            {privacyCopy}
          </p>
        </section>
      ) : null}

      <div className="mt-5 border-t border-slate-200 pt-5 xl:mt-auto">{actions}</div>
    </aside>
  )
}

export const PreviewPurchasePanel = memo(PreviewPurchasePanelComponent)
