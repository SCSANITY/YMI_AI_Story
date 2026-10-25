'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Check, X } from 'lucide-react'
import { getEditionDefinition, EDITION_COMPARISON_IMAGE, type EditionType } from './product/edition-definitions'
import { EditionPrice } from './product/EditionPrice'
import { getUiMessage as t } from '@/lib/i18n-messages'
import type { BookPackagePrice, DisplayCurrency } from '@/types'
import styles from './PreviewExperience.module.css'

// Mounted only while open: no gallery image is requested by the initial Preview.
export function EditionDetailsDialog({ edition, selected, price, currency, onChoose, onClose }: {
  edition: EditionType; selected: EditionType; price: BookPackagePrice; currency: DisplayCurrency
  onChoose: (edition: EditionType) => void; onClose: () => void
}) {
  const definition = getEditionDefinition(edition)
  const gallery = [...definition.gallery, EDITION_COMPARISON_IMAGE]
  const [index, setIndex] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const id = useId()
  const voice = edition === 'supreme'
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    const body = document.body
    const scrollY = window.scrollY
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, right: body.style.right, width: body.style.width, overflow: body.style.overflow }
    Object.assign(body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' })
    const frame = requestAnimationFrame(() => close.current?.focus({ preventScroll: true }))
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],[tabindex="0"]') ?? [])]
      const first = elements[0], last = elements.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', keydown)
      Object.assign(body.style, previous)
      window.scrollTo({ top: scrollY, behavior: 'auto' })
      origin?.focus({ preventScroll: true })
    }
  }, [])
  if (typeof document === 'undefined') return null
  const image = gallery[index]
  return createPortal(<div className={styles.dialogBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} className={styles.editionDialog} data-edition={edition}>
      <button ref={close} className={styles.dialogClose} type="button" aria-label="Close edition details" onClick={onClose}><X size={20} /></button>
      <div className={styles.dialogThumbs} aria-label="Edition gallery">
        {gallery.map((item, i) => <button key={item.src} type="button" aria-label={t(item.altKey)} aria-pressed={i === index} onClick={() => setIndex(i)}><Image src={item.src} alt="" width={66} height={66} sizes="66px" /></button>)}
      </div>
      <div className={styles.dialogImage}><Image src={image.src} alt={t(image.altKey)} fill sizes="(max-width: 767px) 300px, 436px" /></div>
      <div className={styles.dialogCopy}>
        <p className={styles.eyebrow}>{voice ? 'READS IN YOUR VOICE' : 'KEEPSAKE HARDCOVER'}</p>
        <h2 id={id}>Hardcover{voice ? <em> + Voice</em> : null}</h2>
        <EditionPrice price={price} currency={currency} />
        <ul>{definition.features.map(({ Icon, textKey }) => <li key={textKey}><Icon size={22} aria-hidden="true" /><span>{t(textKey)}</span></li>)}</ul>
        <button type="button" className={styles.chooseEdition} data-selected={selected === edition || undefined} onClick={() => { onChoose(edition); onClose() }}>
          {selected === edition ? <>Selected <Check size={16} /></> : `Choose ${t(definition.nameKey)}`}
        </button>
      </div>
    </div>
  </div>, document.body)
}
