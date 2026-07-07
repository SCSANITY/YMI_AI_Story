'use client'

import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { StoryLanguage } from '@/types'

type StoryLanguageSelectorProps = {
  value: StoryLanguage
  labels: {
    field: string
    english: string
    simplifiedChinese: string
    traditionalChinese: string
    comingSoon: string
  }
  onChange: (value: StoryLanguage) => void
}

const OPTIONS = [
  { value: 'English' as StoryLanguage, labelKey: 'english' as const, disabled: false },
  { value: 'Simplified Chinese' as StoryLanguage, labelKey: 'simplifiedChinese' as const, disabled: true },
  { value: 'Traditional Chinese' as StoryLanguage, labelKey: 'traditionalChinese' as const, disabled: true },
]

function StoryLanguageSelectorComponent({ value, labels, onChange }: StoryLanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentLabel =
    value === 'English'
      ? labels.english
      : value === 'Simplified Chinese'
        ? labels.simplifiedChinese
      : value === 'Traditional Chinese'
        ? labels.traditionalChinese
        : String(value)

  const handleSelect = useCallback((nextValue: StoryLanguage) => {
    onChange(nextValue)
    setIsOpen(false)
  }, [onChange])

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">{labels.field}</label>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-[15px] font-semibold text-slate-950 glass-input"
        >
          {currentLabel}
        </button>
        <ChevronDown className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        {isOpen && (
          <div
            className="absolute z-30 mt-2 w-full rounded-2xl border border-white/70 bg-white/92 backdrop-blur-xl shadow-[0_18px_44px_rgba(16,24,40,0.14)] p-2 overflow-auto"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                  value === option.value
                    ? 'bg-amber-50 text-amber-700 font-semibold'
                    : option.disabled
                      ? 'cursor-not-allowed text-gray-400'
                      : 'text-gray-700 hover:bg-amber-50'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  if (option.disabled) return
                  handleSelect(option.value)
                }}
              >
                <span>{labels[option.labelKey]}</span>
                {option.disabled ? (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                    {labels.comingSoon}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const StoryLanguageSelector = memo(StoryLanguageSelectorComponent)
