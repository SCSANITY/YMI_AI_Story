'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { LegalSection, LegalTextItem } from '@/lib/footer-legal-content'

type PolicyDialogProps = {
  title: string
  sections?: LegalSection[]
  effectiveDate?: string
  isLoading?: boolean
  error?: string | null
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
  onClose: () => void
  children?: ReactNode
}

function PolicyText({ item }: { item: LegalTextItem }) {
  return <>{item.label ? <><span className="font-semibold">{item.label}</span>{' '}</> : null}{item.href ? (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className="font-medium text-amber-700 underline decoration-amber-300 underline-offset-2 hover:text-amber-800">{item.text}</a>
  ) : item.text}</>
}

export function PolicyDialog({ title, sections = [], effectiveDate = '', isLoading = false, error = null, t, onClose, children }: PolicyDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const body = document.body
    const scrollY = window.scrollY
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow }
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' })
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }))
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.getClientRects().length > 0)
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (!first) return
      if (!panel.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      Object.assign(body.style, previous)
      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
      returnFocus?.focus({ preventScroll: true })
    }
  }, [])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="fixed inset-0 z-[230] flex items-center justify-center p-6">
      <div aria-hidden="true" data-policy-backdrop className="absolute inset-0 bg-black/35 backdrop-blur-[3px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative z-10 flex max-h-[80dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-[0_30px_90px_rgba(0,0,0,.2)] backdrop-blur-xl sm:max-h-[85dvh]">
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-gray-600 transition hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <header className="shrink-0 border-b border-black/10 px-5 py-4 pr-16 sm:px-8 sm:pr-20">
          <h2 id={titleId} className="text-xl font-bold leading-snug text-gray-900 sm:text-2xl">{title}</h2>
          {effectiveDate ? <p className="mt-1 text-xs text-gray-500 sm:text-sm">{t('footer.effectiveDate', { date: effectiveDate })}</p> : null}
        </header>
        <div data-policy-scroll tabIndex={0} role="region" aria-labelledby={titleId} className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 text-sm leading-relaxed text-gray-700 [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300 sm:px-8">
          {children ?? (error ? (
            <p role="alert">Policy content could not be loaded. Close this window and try again.</p>
          ) : isLoading ? <p role="status">Loading policy...</p> : sections.map((section, index) => (
            <section key={index}>
              {section.title ? <h3 className="mb-2 text-base font-semibold text-gray-900">{section.title}</h3> : null}
              {section.paragraphs?.map((item, paragraph) => <p key={paragraph} className="mb-2"><PolicyText item={item} /></p>)}
              {section.bullets ? <ul className="list-disc space-y-1 pl-5">{section.bullets.map((item, bullet) => <li key={bullet}><PolicyText item={item} /></li>)}</ul> : null}
            </section>
          )))}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-black/10 px-5 py-3 sm:px-8">
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-black/10 bg-amber-50 px-6 text-sm font-semibold text-gray-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">{t('common.close')}</button>
        </footer>
      </div>
    </div>, document.body,
  )
}
