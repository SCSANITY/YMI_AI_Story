'use client'

import Image from 'next/image'
import { Mic, PenLine } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BookPackagePricing, DisplayCurrency } from '@/types'
import { EDITION_DEFINITIONS, type EditionType } from './product/edition-definitions'
import { EditionPrice } from './product/EditionPrice'
import { getUiMessage as t } from '@/lib/i18n-messages'
import styles from './PreviewExperience.module.css'

export function PreviewYourBookPanel({ value, pricing, currency, childName, disabled = false, voiceDisabled = false, voiceReady, notice, recovery, onChange, onDetails, onVoice, onMessage, actions }: {
  value: EditionType; pricing: BookPackagePricing; currency: DisplayCurrency; childName: string
  disabled?: boolean; voiceDisabled?: boolean; voiceReady: boolean; notice?: string | null; recovery?: ReactNode
  onChange: (value: EditionType) => void; onDetails: (value: EditionType) => void
  onVoice: () => void; onMessage: () => void; actions: ReactNode
}) {
  return <aside className={styles.panel} aria-label="Your book">
    <h2>Your book</h2>
    <div role="radiogroup" aria-label="Book Type" className={styles.editionOptions}>
      {EDITION_DEFINITIONS.map(edition => <div className={styles.editionOption} key={edition.type} data-selected={value === edition.type || undefined}>
        {edition.type === 'supreme' ? <span className={styles.popular}>✦ MOST POPULAR</span> : null}
        <label className={styles.editionRadio}>
          <input type="radio" name="preview-edition" aria-label={t(edition.nameKey)} value={edition.type} checked={value === edition.type} disabled={disabled} onChange={() => onChange(edition.type)} />
          <Image src={edition.gallery[0].src} alt={t(edition.gallery[0].altKey)} width={60} height={60} sizes="60px" />
          <span className={styles.editionText}><strong>{t(edition.nameKey)}</strong><EditionPrice as="span" price={pricing[edition.type]} currency={currency} className={styles.compactPrice} /></span>
          <span className={styles.radioDot} aria-hidden="true" />
        </label>
        <button type="button" className={styles.detailsLink} disabled={disabled} onClick={() => onDetails(edition.type)}>See details</button>
      </div>)}
    </div>
    {value === 'supreme' ? <div className={styles.voiceRow}><Mic size={18} aria-hidden="true" /><span>Your voice · now or after purchase</span><button type="button" disabled={disabled || voiceDisabled} onClick={onVoice}>{voiceReady ? 'Change' : 'Record'}</button></div> : null}
    <div className={styles.messageRow}><PenLine size={21} aria-hidden="true" /><span><strong>A message for {childName}</strong><small>Optional · up to 48h after purchase</small></span><button type="button" disabled={disabled} onClick={onMessage}>Write</button></div>
    <div className={styles.panelNotice}><span role={notice ? 'alert' : undefined}>{notice}</span>{recovery}</div>
    {actions}
  </aside>
}
