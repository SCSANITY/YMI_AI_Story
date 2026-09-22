'use client'

import { memo, startTransition, useCallback, useState, type ReactNode } from 'react'
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
  dedication?: ReactNode
  onChange: (value: PurchasePackageType) => Promise<void>
  onOpenVoice: () => void
  selectionDisabled?: boolean
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
  dedication,
  onChange,
  onOpenVoice,
  selectionDisabled = false,
}: PreviewPurchasePanelProps) {
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())
  const [selection, setSelection] = useState({ confirmedValue: value, editionError, value })
  // Reconcile before commit, rather than briefly painting a stale checked card.
  // Local optimistic edits leave confirmedValue untouched until the parent updates.
  if (selection.confirmedValue !== value || selection.editionError !== editionError) {
    setSelection({ confirmedValue: value, editionError, value })
  }
  const selectedValue = selection.value
  const setSelectedValue = useCallback((nextValue: PurchasePackageType) => {
    setSelection((current) => ({ ...current, value: nextValue }))
  }, [])

  const handleEditionChange = useCallback((nextValue: PurchasePackageType) => {
    if (nextValue === selectedValue) return

    setSelectedValue(nextValue)
    startTransition(() => {
      void onChange(nextValue)
    })
  }, [onChange, selectedValue, setSelectedValue])

  return (
    <aside className="flex w-full flex-col rounded-[1.35rem] bg-white p-5 shadow-[0_24px_65px_-48px_rgba(69,44,15,0.6)] sm:p-6 xl:mx-auto xl:max-w-[380px] xl:p-5">
      <fieldset disabled={selectionDisabled}>
        <legend className="font-serif text-xl font-bold tracking-[-0.02em] text-slate-950 sm:text-2xl xl:text-xl">{title}</legend>
        <div className="mt-4 flex flex-col gap-2.5" role="radiogroup" aria-busy={isSavingEdition} data-saving={isSavingEdition ? '' : undefined}>
          {options.map((option) => {
            const selected = option.value === selectedValue
            const imageFailed = failedImages.has(option.value)
            return (
              <label
                key={option.value}
                className={`relative grid min-h-20 ${selectionDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${imageFailed ? 'grid-cols-[minmax(0,1fr)_22px]' : 'grid-cols-[72px_minmax(0,1fr)_22px]'} items-center gap-2.5 rounded-xl border p-2.5 transition focus-within:ring-2 focus-within:ring-amber-500 focus-within:ring-offset-2 ${
                  selected
                    ? 'border-amber-500 bg-amber-50/70 shadow-[0_12px_28px_-22px_rgba(180,83,9,0.65)]'
                    : 'border-slate-200 bg-white hover:border-amber-300'
                }`}
              >
                <input
                  className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  type="radio"
                  name="book-edition"
                  aria-label={`${option.title}, ${option.subtitle}, ${option.price}`}
                  value={option.value}
                  checked={selected}
                  onChange={() => handleEditionChange(option.value)}
                />
                {!imageFailed ? (
                  <span className="relative block h-[56px] overflow-hidden rounded-lg bg-amber-50">
                    <Image
                      src={option.image}
                      alt={option.imageAlt}
                      fill
                      sizes="72px"
                      className="object-cover"
                      onError={() => setFailedImages((current) => new Set(current).add(option.value))}
                    />
                  </span>
                ) : (
                  null
                )}
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-950">{option.title}</span>
                    {option.badge ? (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.09em] text-slate-950">
                        {option.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-slate-600">{option.subtitle}</span>
                  <span className="mt-0.5 block text-[13px] font-extrabold text-slate-950">{option.price}</span>
                </span>
                <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border ${selected ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 text-transparent'}`} aria-hidden="true">
                  <Check className="h-3.5 w-3.5" />
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {editionError ? <p className="mt-3 text-sm font-semibold text-red-600" role="alert">{editionError}</p> : null}

      {selectedValue === 'supreme' && !selectionDisabled ? (
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

      {dedication}
      <div className="mt-4 border-t border-slate-200 pt-4">{actions}</div>
    </aside>
  )
}

export const PreviewPurchasePanel = memo(PreviewPurchasePanelComponent)
