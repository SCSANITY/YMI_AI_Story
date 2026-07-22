'use client'

import { useRef, type KeyboardEvent } from 'react'
import { BookMarked, Images } from 'lucide-react'
import type { MyBooksShelf } from './myBooksShelf'

type MyBooksShelfSwitcherProps = {
  activeShelf: MyBooksShelf
  purchasedCount: number
  previewCount: number
  purchasedLabel: string
  purchasedDescription: string
  previewsLabel: string
  previewsDescription: string
  ariaLabel: string
  onChange: (shelf: MyBooksShelf) => void
}

export function MyBooksShelfSwitcher({
  activeShelf,
  purchasedCount,
  previewCount,
  purchasedLabel,
  previewsLabel,
  ariaLabel,
  onChange,
}: MyBooksShelfSwitcherProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const shelves = [
    { id: 'purchased' as const, label: purchasedLabel, count: purchasedCount, Icon: BookMarked },
    { id: 'previews' as const, label: previewsLabel, count: previewCount, Icon: Images },
  ]
  const activeIndex = shelves.findIndex((shelf) => shelf.id === activeShelf)

  const activateAndFocus = (index: number) => {
    onChange(shelves[index].id)
    tabRefs.current[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const direction = event.key === 'ArrowRight' ? 1 : -1
      activateAndFocus((index + direction + shelves.length) % shelves.length)
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      activateAndFocus(event.key === 'Home' ? 0 : shelves.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onChange(shelves[index].id)
    }
  }

  return (
    <div className="w-full sm:w-auto">
      <div className="w-full rounded-full border border-white/70 bg-white/55 p-1.5 shadow-[0_18px_50px_-20px_rgba(180,120,40,0.35)] ring-1 ring-white/40 backdrop-blur-2xl backdrop-saturate-150 sm:w-auto">
        <div role="tablist" aria-label={ariaLabel} className="relative grid grid-cols-2 sm:inline-grid sm:auto-cols-fr">
          {/* Sliding glass indicator */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-full bg-white/95 shadow-[0_8px_22px_-8px_rgba(180,120,40,0.45)] ring-1 ring-amber-100/90 transition-transform duration-300 ease-[cubic-bezier(0.34,1.4,0.5,1)] ${
              activeIndex === 1 ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          {shelves.map(({ id, label, count, Icon }, index) => {
            const isActive = activeShelf === id
            return (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[index] = node
                }}
                id={`my-books-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`my-books-panel-${id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onChange(id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className="group relative z-10 flex min-w-0 items-center justify-center gap-2.5 rounded-full px-4 py-2.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white/60"
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors duration-200 ${
                    isActive ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-500'
                  }`}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span
                    className={`truncate text-sm font-semibold tracking-tight transition-colors duration-200 sm:text-[0.95rem] ${
                      isActive ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  >
                    {label}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums transition-colors duration-200 ${
                      isActive ? 'text-amber-600/90' : 'text-slate-300 group-hover:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
