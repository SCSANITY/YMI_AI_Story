'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Globe } from 'lucide-react'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import type { DisplayCurrency } from '@/types'

type CurrencySwitcherProps = {
  className?: string
  buttonClassName?: string
  menuClassName?: string
}

type MenuPosition = {
  top: number
  left: number
  width: number
}

type CurrencyOption = {
  currency: DisplayCurrency
  region: string
  label: string
}

const CURRENCY_OPTIONS: CurrencyOption[] = [
  { currency: 'USD', region: 'US', label: 'United States' },
  { currency: 'EUR', region: 'EU', label: 'Europe' },
  { currency: 'GBP', region: 'UK', label: 'United Kingdom' },
  { currency: 'JPY', region: 'JP', label: 'Japan' },
  { currency: 'AUD', region: 'AU', label: 'Australia' },
  { currency: 'CAD', region: 'CA', label: 'Canada' },
  { currency: 'SGD', region: 'SG', label: 'Singapore' },
  { currency: 'HKD', region: 'HK', label: 'Hong Kong' },
  { currency: 'KRW', region: 'KR', label: 'South Korea' },
  { currency: 'CNY', region: 'CN', label: 'China' },
]

const MENU_WIDTH = 248
const MENU_MARGIN = 8
const MENU_Z_INDEX = 2147483000

export function CurrencySwitcher({ className, buttonClassName, menuClassName }: CurrencySwitcherProps) {
  const { displayCurrency, setDisplayCurrency } = useGlobalContext()
  const [isOpen, setIsOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentOption = useMemo(
    () => CURRENCY_OPTIONS.find((option) => option.currency === displayCurrency) ?? CURRENCY_OPTIONS[0],
    [displayCurrency]
  )

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === 'undefined') return
    const rect = buttonRef.current.getBoundingClientRect()
    const top = rect.bottom + MENU_MARGIN
    const left = Math.min(
      Math.max(MENU_MARGIN, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - MENU_MARGIN
    )
    setMenuPosition({ top, left, width: MENU_WIDTH })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    updateMenuPosition()

    const handleReflow = () => updateMenuPosition()
    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)

    return () => {
      window.removeEventListener('resize', handleReflow)
      window.removeEventListener('scroll', handleReflow, true)
    }
  }, [isOpen, updateMenuPosition])

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutside, true)
    return () => document.removeEventListener('mousedown', handleOutside, true)
  }, [])

  const handleSelect = (currency: DisplayCurrency) => {
    setDisplayCurrency(currency)
    setIsOpen(false)
  }

  const dropdown =
    typeof document !== 'undefined' && isOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className={`fixed rounded-2xl border border-white/60 bg-white/92 p-1.5 shadow-[0_18px_45px_rgba(120,64,32,0.18)] backdrop-blur-xl backdrop-saturate-150 ${menuClassName ?? ''}`}
            style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, zIndex: MENU_Z_INDEX, pointerEvents: 'auto' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-600">
              Region / Currency
            </div>
            {CURRENCY_OPTIONS.map((option) => {
              const isSelected = option.currency === displayCurrency
              return (
                <button
                  key={option.currency}
                  type="button"
                  onClick={() => handleSelect(option.currency)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    isSelected
                      ? 'bg-amber-50 text-amber-800'
                      : 'text-slate-700 hover:bg-orange-50/80 hover:text-orange-700'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {option.region} - {option.currency}
                    </span>
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                </button>
              )
            })}
          </div>,
          document.body
        )
      : null

  return (
    <div className={`relative z-[140] ${className ?? ''}`} ref={rootRef}>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((value) => !value)
        }}
        className={`gap-1 px-2 ${buttonClassName ?? ''}`}
        aria-label="Select region and currency"
        aria-expanded={isOpen}
      >
        <Globe className="h-4 w-4" />
        <span className="text-xs font-semibold">{currentOption.currency}</span>
      </Button>
      {dropdown}
    </div>
  )
}
