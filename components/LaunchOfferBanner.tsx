import styles from './LaunchOfferBanner.module.css'
import type { MultiBookOfferRule } from '@/lib/multi-book-offer-core'

// Home-only launch banner. Rendered by the server home page with the rule
// already read server-side; emits the --launch-banner-h geometry variable in
// the initial HTML so the navbar/hero offsets are stable from first paint.
// Nothing renders when the offer is disabled or the rule read failed.

const DESKTOP_COPY = '🎉 Celebrate Our New Launch! Enjoy 60% OFF Shipping, 20% OFF 2+ Books This Christmas! 🎄'
const MOBILE_COPY = '🎉 60% OFF Shipping, 20% OFF 2+ Books This Christmas! 🎄'

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
  if (!rule?.enabled) return null
  return (
    <>
      <style>{':root{--launch-banner-h:36px}@media (max-width:767px){:root{--launch-banner-h:32px}}'}</style>
      <div className={styles.bar} role="note">
        <div className={`${styles.track} hidden md:flex`}>
          <MarqueeGroup copy={DESKTOP_COPY} />
          <MarqueeGroup copy={DESKTOP_COPY} ariaHidden />
        </div>
        <div className={`${styles.track} ${styles.trackMobile} md:hidden`}>
          <MarqueeGroup copy={MOBILE_COPY} />
          <MarqueeGroup copy={MOBILE_COPY} ariaHidden />
        </div>
      </div>
    </>
  )
}
