'use client'

import type { Ref } from 'react'
import { Loader2, Share2, ShoppingCart } from 'lucide-react'
import styles from './PreviewExperience.module.css'

export function PreviewPurchaseActions({ acknowledged, onAcknowledged, acknowledgementLabel, acknowledgementError, checkboxRef, price, ready, busy, cartRef, onPurchase, onCart, onShare, canShare, sharing }: {
  acknowledged: boolean; onAcknowledged: (value: boolean) => void; acknowledgementLabel: string; acknowledgementError: string | null
  checkboxRef: Ref<HTMLInputElement>; price: string; ready: boolean; busy: boolean; cartRef: Ref<HTMLButtonElement>
  onPurchase: () => void; onCart: () => void; onShare: () => void; canShare: boolean; sharing: boolean
}) {
  return <div className={styles.purchaseActions}>
    <label className={styles.acknowledgement}><input ref={checkboxRef} type="checkbox" checked={acknowledged} onChange={event => onAcknowledged(event.target.checked)} /><span>{acknowledgementLabel}</span></label>
    <div className={styles.acknowledgementError} role={acknowledgementError ? 'alert' : undefined}>{acknowledgementError}</div>
    <button type="button" className={styles.purchase} disabled={!ready || busy} onClick={onPurchase}>{busy ? <Loader2 size={18} className="animate-spin" /> : null} Purchase · <span>{price}</span></button>
    <div className={styles.secondaryActions}><button ref={cartRef} type="button" disabled={!ready || busy} onClick={onCart}><ShoppingCart size={17} />Add to cart</button><button type="button" aria-label="Share preview" disabled={!canShare || sharing} onClick={onShare}>{sharing ? <Loader2 size={17} className="animate-spin" /> : <Share2 size={17} />}</button></div>
  </div>
}

export function PreviewMobilePurchase({ edition, price, ready, busy, waitingLabel, onPurchase }: { edition: string; price: string; ready: boolean; busy: boolean; waitingLabel: string; onPurchase: () => void }) {
  return <div className={styles.mobilePurchase}><span><small>{edition}</small><strong>{price}</strong></span><button type="button" disabled={!ready || busy} onClick={onPurchase}>{busy ? <Loader2 size={15} className="animate-spin" /> : null} {ready ? 'Purchase' : waitingLabel}</button></div>
}
