import Image from 'next/image'
import shippingSticker from '../public/home-shipping-sticker.webp'
import styles from './LaunchOfferBanner.module.css'
import { getMultiBookOfferBadgeLabel, type MultiBookOfferRule } from '@/lib/multi-book-offer-core'

// Home-only launch banner. Rendered by the server home page with the rule
// already read server-side; emits the --launch-banner-h geometry variable in
// the initial HTML so the navbar/hero offsets are stable from first paint.

function MarqueeGroup({ copy, ariaHidden }: { copy: string; ariaHidden?: boolean }) {
  // Enough repeats that one group is wider than any realistic viewport, so the
  // translateX(-50%) loop never shows a gap.
  return (
    <div className={styles.group} aria-hidden={ariaHidden}>
      {Array.from({ length: 6 }).map((_, index) => (
        <span key={index} style={{ display: 'contents' }}>
          <b>{copy}</b>
          <i>✦</i>
        </span>
      ))}
    </div>
  )
}

export function LaunchOfferBanner({ rule }: { rule: MultiBookOfferRule | null }) {
  const bookOffer = rule?.enabled
    ? `, ${rule.effectType === 'fixed_amount' ? 'US' : ''}${getMultiBookOfferBadgeLabel(rule)} ${rule.minItems}+ Books`
    : ''
  const offers = `60% OFF Shipping${bookOffer}!`
  const desktopCopy = `🎉 Celebrate Our New Launch! Enjoy ${offers}`
  const mobileCopy = `🎉 ${offers}`
  return (
    <>
      <style>{':root{--launch-banner-h:36px}@media (max-width:767px){:root{--launch-banner-h:32px}}'}</style>
      <Image className={styles.shippingSticker} src={shippingSticker} alt="" draggable={false} unoptimized />
      <div className={styles.bar} role="note">
        <div className={`${styles.track} hidden md:flex`}>
          <MarqueeGroup copy={desktopCopy} />
          <MarqueeGroup copy={desktopCopy} ariaHidden />
        </div>
        <div className={`${styles.track} ${styles.trackMobile} flex md:hidden`}>
          <MarqueeGroup copy={mobileCopy} />
          <MarqueeGroup copy={mobileCopy} ariaHidden />
        </div>
      </div>
    </>
  )
}
