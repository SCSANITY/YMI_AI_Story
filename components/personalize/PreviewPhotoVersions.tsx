'use client'

import Image from 'next/image'
import { Camera, Loader2, UserRound } from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { PreviewVariantView } from '@/lib/preview-variant-view'
import styles from './PreviewExperience.module.css'

export function PreviewPhotoVersions({ versions, selectedJobId, cap, changeCount, waiting, disabled, changing, error, onUpload, onSelect }: {
  versions: PreviewVariantView[]; selectedJobId: string | null; cap: number; changeCount: number
  waiting: boolean; disabled: boolean; changing: boolean; error: string | null
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onSelect: (version: PreviewVariantView) => void
}) {
  const remaining = Math.max(0, cap - changeCount)
  const caption = error || (remaining === 0 ? `You've used all ${cap} photo changes.` : waiting ? 'Change photo once your preview is ready' : '')
  return <div className={styles.versions} aria-label="Photo versions">
    <div className={styles.versionControls}>
      <label className={styles.changePhoto} aria-disabled={disabled || remaining === 0}>
        {changing ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Camera size={14} aria-hidden="true" />}<span>Change photo</span>
        <input aria-label="Change photo" type="file" accept="image/*" disabled={disabled || remaining === 0} onChange={onUpload} />
      </label>
      <div className={styles.versionSlots}>
        {Array.from({length:cap+1},(_,index) => {
          const version=versions[index]
          const label=index===0?'Original photo':`Photo version ${index+1}`
          return version ? <button key={version.jobId} type="button" aria-label={label} aria-pressed={version.jobId===selectedJobId} disabled={disabled || version.status!=='ready'} className={styles.versionThumb} onClick={()=>onSelect(version)} onContextMenu={event=>event.preventDefault()}>
            {version.photoPreviewUrl ? <Image src={version.photoPreviewUrl} alt="" fill unoptimized sizes="40px" draggable={false} className="pointer-events-none select-none object-cover" /> : <UserRound size={16} aria-hidden="true" />}
          </button> : <span key={index} className={styles.emptyVersion} aria-label={`Unused photo slot ${index+1}`} />
        })}
      </div>
      <span className={styles.changesLeft}>{remaining} {remaining===1?'change':'changes'} left</span>
    </div>
    <p className={styles.versionCaption} role={error?'alert':undefined}>{caption || <span className={styles.phoneRemainingCount}>{remaining} {remaining===1?'change':'changes'} left</span>}</p>
  </div>
}
