'use client'

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type AdminFloatingDialogProps = {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  onClose: () => void
  maxWidthClassName?: string
  bodyClassName?: string
  zIndexClassName?: string
  backdrop?: 'none' | 'blur'
  placement?: 'top' | 'center'
}

const ADMIN_THEME_VARIABLES = [
  '--admin-ink',
  '--admin-ink-soft',
  '--admin-muted',
  '--admin-line',
  '--admin-panel',
  '--admin-panel-2',
  '--admin-card',
  '--admin-card-line',
  '--admin-card-sh',
  '--admin-glass',
  '--admin-glass-border',
  '--admin-job-glass-top',
  '--admin-job-glass-middle',
  '--admin-job-glass-bottom',
  '--admin-job-glass-highlight',
  '--admin-accent',
  '--admin-accent-dp',
  '--admin-accent-ink',
  '--admin-good',
  '--admin-warn',
  '--admin-crit',
  '--admin-page-ink',
  '--admin-page-muted',
] as const

export function useAdminPortalTheme(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const source = document.querySelector<HTMLElement>('.ymi-admin-theme')
    const target = ref.current
    if (!source || !target) return
    const sourceStyle = window.getComputedStyle(source)
    for (const variable of ADMIN_THEME_VARIABLES) {
      target.style.setProperty(variable, sourceStyle.getPropertyValue(variable))
    }
  }, [ref])
}

export function AdminFloatingDialog({
  eyebrow,
  title,
  subtitle,
  children,
  onClose,
  maxWidthClassName = 'max-w-2xl',
  bodyClassName = 'p-4 sm:p-6',
  zIndexClassName = 'z-[190]',
  backdrop = 'none',
  placement = 'top',
}: AdminFloatingDialogProps) {
  const generatedTitleId = useId()
  const layerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useAdminPortalTheme(layerRef)

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
    }
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (panelRef.current?.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    if (backdrop !== 'blur') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [backdrop])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={layerRef}
      className={`admin-v2-floating-layer fixed inset-0 ${zIndexClassName} flex justify-center p-3 sm:p-6 ${
        placement === 'center'
          ? 'items-center'
          : 'items-start pt-[clamp(4.5rem,10dvh,7rem)] sm:pt-[clamp(5rem,9dvh,7rem)]'
      } ${
        backdrop === 'blur'
          ? 'pointer-events-auto bg-black/15 backdrop-blur-[3px]'
          : 'pointer-events-none'
      }`}
    >
      <section
        ref={panelRef}
        className={`admin-v2-floating-dialog pointer-events-auto flex max-h-[calc(100dvh-6rem)] w-full min-w-0 flex-col overflow-hidden sm:max-h-[82dvh] ${maxWidthClassName}`}
        role="dialog"
        aria-labelledby={generatedTitleId}
        aria-modal={backdrop === 'blur' ? 'true' : undefined}
      >
        <header className="admin-v2-floating-dialog-header flex shrink-0 items-start justify-between gap-4 px-4 py-4 sm:px-5 sm:py-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-semibold text-[var(--admin-accent-dp)]">{eyebrow}</p>
            ) : null}
            <h2
              id={generatedTitleId}
              className={`${eyebrow ? 'mt-1' : ''} truncate text-lg font-bold text-[var(--admin-page-ink)] sm:text-xl`}
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 truncate text-xs text-[var(--admin-page-muted)]">{subtitle}</p>
            ) : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="admin-v2-floating-dialog-close grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--admin-page-muted)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] lg:h-9 lg:w-9"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className={`admin-review-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>
          {children}
        </div>
      </section>
    </div>,
    document.body
  )
}
