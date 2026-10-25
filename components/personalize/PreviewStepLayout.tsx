'use client'

import { memo, type ReactNode } from 'react'
import styles from './PreviewExperience.module.css'

type PreviewStepLayoutProps = { progress: ReactNode; intro: ReactNode; book: ReactNode; purchase: ReactNode; versions: ReactNode; status: ReactNode; mobilePurchase: ReactNode }

function PreviewStepLayoutComponent({ progress, intro, book, purchase, versions, status, mobilePurchase }: PreviewStepLayoutProps) {
  return <div className={styles.experience}><div className={styles.previewGrid}>
    <section className={styles.bookColumn} aria-label="Book Preview">
      <div className={styles.progress}>{progress}</div><div className={styles.intro}>{intro}</div>
      <div className={styles.mobileStatus}>{status}</div><div className={styles.bookSlot}>{book}</div>{versions}
    </section><div className={styles.purchaseColumn}>{purchase}</div>
  </div>{mobilePurchase}</div>
}
export const PreviewStepLayout = memo(PreviewStepLayoutComponent)
