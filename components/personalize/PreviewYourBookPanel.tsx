'use client'

import Image from 'next/image'
import type { ReactNode } from 'react'
import type { BookPackagePricing, DisplayCurrency } from '@/types'
import { EDITION_DEFINITIONS, type EditionType } from './product/edition-definitions'
import { EditionPrice } from './product/EditionPrice'
import { getUiMessage as t } from '@/lib/i18n-messages'
import styles from './PreviewExperience.module.css'

export function PreviewYourBookPanel({ value, pricing, currency, disabled = false, notice, recovery, guestEmail, onChange, onDetails, actions }: {
  value: EditionType | 'digital'; pricing: BookPackagePricing; currency: DisplayCurrency
  disabled?: boolean; notice?: string | null; recovery?: ReactNode; guestEmail?: ReactNode
  onChange: (value: EditionType | 'digital') => void; onDetails: (value: EditionType) => void
  actions: ReactNode
}) {
  return <aside className={styles.panel} aria-label="Your book">
    <h2>Your book</h2>
    <div role="radiogroup" aria-label="Book Type" className={styles.editionOptions}>
      {pricing.digital && <label className={styles.editionOption} data-selected={value === 'digital' || undefined}>
        <span className={styles.editionRadio}>
          <input type="radio" name="preview-edition" value="digital" checked={value === 'digital'} disabled={disabled} onChange={() => onChange('digital')} />
          <Image src="/customize-product/v3/personalized-pdf.webp" alt="" width={60} height={60} sizes="60px" />
          <span className={styles.editionText}><strong>PDF only</strong><EditionPrice as="span" price={pricing.digital} currency={currency} className={styles.compactPrice} /></span>
          <span className={styles.radioDot} aria-hidden="true" />
        </span>
      </label>}
      {EDITION_DEFINITIONS.map(edition => <div className={styles.editionOption} key={edition.type} data-selected={value === edition.type || undefined}>
        {edition.type === 'supreme' ? <span className={styles.popular}>✦ MOST POPULAR</span> : null}
        <label className={styles.editionRadio}>
          <input type="radio" name="preview-edition" aria-label={t(edition.nameKey)} value={edition.type} checked={value === edition.type} disabled={disabled} onChange={() => onChange(edition.type)} />
          <Image src={edition.previewOptionImage} alt={t(edition.nameKey)} width={60} height={60} sizes="60px" />
          <span className={styles.editionText}><strong>{t(edition.nameKey)}</strong><EditionPrice as="span" price={pricing[edition.type]} currency={currency} className={styles.compactPrice} /></span>
          <span className={styles.radioDot} aria-hidden="true" />
        </label>
        <button type="button" className={styles.detailsLink} disabled={disabled} onClick={() => onDetails(edition.type)}>See details</button>
      </div>)}
    </div>
    {value === 'basic' && <p className={styles.voiceNote}>You can add your personal message after purchase.</p>}
    {value === 'supreme' && <p className={styles.voiceNote}>You can add your personal message and voice narration after purchase.</p>}
    {guestEmail}
    <div className={styles.panelNotice}><span role={notice ? 'alert' : undefined}>{notice}</span>{recovery}</div>
    {actions}
  </aside>
}
