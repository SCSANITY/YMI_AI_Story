'use client'

import React, { memo, useMemo, useState } from 'react'
import { Check, ChevronDown, Star } from 'lucide-react'

export type PersonalizeBookType = 'digital' | 'basic' | 'premium' | 'supreme'

type BookPackageSelectorProps = {
  value: PersonalizeBookType
  labels: {
    field: string
    digitalTitle: string
    digitalSubtitle: string
    basicTitle: string
    basicSubtitle: string
    supremeTitle: string
    supremeSubtitle: string
    whatIncluded: string
  }
  includedItems: {
    digital: string[]
    basic: string[]
    supreme: string[]
  }
  onChange: (value: PersonalizeBookType) => void
}

const PACKAGE_OPTIONS = [
  {
    value: 'digital' as PersonalizeBookType,
    titleKey: 'digitalTitle' as const,
    subtitleKey: 'digitalSubtitle' as const,
  },
  {
    value: 'basic' as PersonalizeBookType,
    titleKey: 'basicTitle' as const,
    subtitleKey: 'basicSubtitle' as const,
  },
  {
    value: 'supreme' as PersonalizeBookType,
    titleKey: 'supremeTitle' as const,
    subtitleKey: 'supremeSubtitle' as const,
  },
]

function BookPackageSelectorComponent({ value, labels, includedItems, onChange }: BookPackageSelectorProps) {
  const [isIncludedOpen, setIncludedOpen] = useState(false)
  const items = useMemo(() => {
    if (value === 'basic' || value === 'supreme') {
      return includedItems[value]
    }
    return includedItems.digital
  }, [includedItems, value])

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">{labels.field}</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PACKAGE_OPTIONS.map((option) => {
          const isSelected = value === option.value

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`p-3 rounded-2xl text-left transition-all ${
                isSelected
                  ? 'border border-amber-400/60 bg-white/90 shadow-[0_4px_16px_rgba(245,158,11,0.16),inset_0_1px_0_rgba(255,255,255,0.9)]'
                  : 'border border-white/55 bg-white/50 backdrop-blur-sm hover:bg-white/75 hover:border-white/70'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{labels[option.titleKey]}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{labels[option.subtitleKey]}</div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/60 bg-white/55 shadow-[0_4px_16px_rgba(148,93,34,0.06)] backdrop-blur-sm">
        <button
          type="button"
          aria-expanded={isIncludedOpen}
          onClick={() => setIncludedOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-white/55"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.10em] text-amber-700">
                {labels.whatIncluded}
              </span>
              <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                {items.length} · {labels[value === 'basic' ? 'basicTitle' : value === 'supreme' ? 'supremeTitle' : 'digitalTitle']}
              </span>
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-amber-600 transition-transform duration-200 ${
              isIncludedOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isIncludedOpen ? (
          <ul className="space-y-2 border-t border-white/65 px-4 pb-4 pt-3">
            {items.map((item) => {
              const separatorIndex = item.indexOf(': ')
              const label = separatorIndex > 0 ? item.slice(0, separatorIndex) : ''
              const description = separatorIndex > 0 ? item.slice(separatorIndex + 2) : item

              return (
                <li key={item} className="flex items-start gap-2 text-sm leading-6 text-gray-700">
                  <div className="min-w-[16px] pt-1">
                    <Check className="h-4 w-4 text-green-500" />
                  </div>
                  <span>
                    {label ? <span className="font-semibold text-slate-900">{label}: </span> : null}
                    {description}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export const BookPackageSelector = memo(BookPackageSelectorComponent)
