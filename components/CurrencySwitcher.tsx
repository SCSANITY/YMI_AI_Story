'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Check, Search } from 'lucide-react'
import { Button } from '@/components/Button'
import { useGlobalContext } from '@/contexts/GlobalContext'
import {
  CURRENCY_GROUP_ORDER,
  CURRENCY_REGION_OPTIONS,
  resolveCurrencyRegionOption,
  type CurrencyRegionOption,
} from '@/lib/currency-regions'

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

const MENU_WIDTH = 288
const MENU_MARGIN = 8
const MENU_Z_INDEX = 2147483000

function RegionFlag({ region, compact = false }: { region: string; compact?: boolean }) {
  return (
    <Image
      src={`/flags/${region.toLowerCase()}.svg`}
      alt=""
      aria-hidden
      width={compact ? 20 : 28}
      height={compact ? 15 : 21}
      unoptimized
      className={`${compact ? 'h-[15px] w-5' : 'h-[21px] w-7'} rounded-[2px] object-cover shadow-sm ring-1 ring-black/10`}
    />
  )
}

export function CurrencySwitcher({ className, buttonClassName, menuClassName }: CurrencySwitcherProps) {
  const { displayCurrency, displayRegion, setCurrencyRegion } = useGlobalContext()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentOption = useMemo(
    () => resolveCurrencyRegionOption(displayRegion, displayCurrency),
    [displayCurrency, displayRegion]
  )

  const groupedOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return CURRENCY_GROUP_ORDER.map((currency) => ({
      currency,
      options: CURRENCY_REGION_OPTIONS.filter((option) => {
        if (option.currency !== currency) return false
        if (!query) return true
        return `${option.label} ${option.region} ${option.currency}`.toLowerCase().includes(query)
      }),
    })).filter((group) => group.options.length > 0)
  }, [searchQuery])

  const updateMenuPosition = useCallback(() => {
    if (!buttonRef.current || typeof window === 'undefined') return
    const rect = buttonRef.current.getBoundingClientRect()
    const width = Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2)
    const top = rect.bottom + MENU_MARGIN
    const left = Math.min(
      Math.max(MENU_MARGIN, rect.right - width),
      window.innerWidth - width - MENU_MARGIN
    )
    setMenuPosition((current) => {
      if (current?.top === top && current.left === left && current.width === width) return current
      return { top, left, width }
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    updateMenuPosition()

    let frame = 0
    const handleReflow = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateMenuPosition)
    }
    window.addEventListener('resize', handleReflow)
    window.addEventListener('scroll', handleReflow, true)

    return () => {
      window.cancelAnimationFrame(frame)
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
      setSearchQuery('')
    }
    document.addEventListener('mousedown', handleOutside, true)
    return () => document.removeEventListener('mousedown', handleOutside, true)
  }, [])

  const handleSelect = (option: CurrencyRegionOption) => {
    setCurrencyRegion(option.region)
    setIsOpen(false)
    setSearchQuery('')
  }

  const dropdown =
    typeof document !== 'undefined' && isOpen && menuPosition
      ? createPortal(
          <div
            ref={menuRef}
            className={`fixed max-h-[min(72dvh,36rem)] overflow-y-auto rounded-2xl border border-white/60 bg-white/94 p-1.5 shadow-[0_18px_45px_rgba(120,64,32,0.18)] backdrop-blur-xl backdrop-saturate-150 ${menuClassName ?? ''}`}
            style={{ top: menuPosition.top, left: menuPosition.left, width: menuPosition.width, zIndex: MENU_Z_INDEX, pointerEvents: 'auto' }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 rounded-xl bg-white/96 px-1 pb-2 pt-1 backdrop-blur-xl">
              <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-600">
                Region / Currency
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search region or currency"
                  className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                />
              </label>
            </div>
            {groupedOptions.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-slate-500">No matching regions</div>
            ) : groupedOptions.map((group) => (
              <div key={group.currency} className="pb-1">
                <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {group.currency}
                </div>
                {group.options.map((option) => {
                  const isSelected = option.region === currentOption.region
                  return (
                    <button
                      key={option.region}
                      type="button"
                      onClick={() => handleSelect(option)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition ${
                        isSelected
                          ? 'bg-amber-50 text-amber-800'
                          : 'text-slate-700 hover:bg-orange-50/80 hover:text-orange-700'
                      }`}
                    >
                      <span className="w-7 shrink-0">
                        <RegionFlag region={option.region} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-400">
                          {option.region} - {option.currency}
                        </span>
                      </span>
                      {isSelected ? <Check className="h-4 w-4 shrink-0 text-amber-600" /> : null}
                    </button>
                  )
                })}
              </div>
            ))}
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
          if (isOpen) setSearchQuery('')
          setIsOpen(!isOpen)
        }}
        className={`gap-1.5 px-2 ${buttonClassName ?? ''}`}
        aria-label={`Select region and currency. Current selection: ${currentOption.label}, ${currentOption.currency}`}
        aria-expanded={isOpen}
      >
        <RegionFlag region={currentOption.region} compact />
        <span className="text-xs font-semibold">{currentOption.currency}</span>
      </Button>
      {dropdown}
    </div>
  )
}
