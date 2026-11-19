'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Download, FileJson, Images, LoaderCircle, RotateCcw } from 'lucide-react'
import styles from './ProductionMaterials.module.css'

export function StoryFileDownload({
  kind,
  url,
  available,
}: {
  kind: 'artwork' | 'subtitle'
  url: string
  available?: boolean | null
}) {
  const [phase, setPhase] = useState<'idle' | 'busy' | 'started' | 'failed'>('idle')
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  const artwork = kind === 'artwork'
  const title = artwork ? 'Story artwork' : 'Subtitle template'
  const format = artwork ? 'ZIP' : 'JSON'
  const Icon = artwork ? Images : FileJson
  let status = artwork ? 'ZIP archive' : 'JSON file'
  if (available === undefined) status = 'Checking availability…'
  else if (available === false) status = 'Not available yet'
  else if (phase === 'busy') status = 'Preparing ' + format + '…'
  else if (phase === 'failed' || (available === null && phase === 'idle'))
    status = 'Couldn’t prepare ' + format + ' · Retry'
  else if (phase === 'started') status = 'Download started'
  const Action =
    phase === 'busy' ? LoaderCircle : phase === 'failed' ? RotateCcw : phase === 'started' ? Check : Download
  async function download() {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    setPhase('busy')
    try {
      const { downloadStoryFile } = await import('@/lib/admin-story-files-client')
      await downloadStoryFile(url, artwork, controller.signal)
      if (!controller.signal.aborted) setPhase('started')
    } catch {
      if (!controller.signal.aborted) setPhase('failed')
    } finally {
      active.current = null
    }
  }
  return (
    <button
      type="button"
      className={styles.fileRow}
      disabled={available === undefined || available === false || phase === 'busy'}
      aria-busy={phase === 'busy'}
      aria-label={'Download ' + title + ' ' + format}
      onClick={download}
    >
      <span className={artwork ? styles.artSymbol : styles.jsonSymbol}>
        <Icon size={20} />
      </span>
      <span className={styles.fileDetail}>
        <b>{title}</b>
        <small role="status" data-error={phase === 'failed'}>
          {status}
        </small>
      </span>
      {available !== false && <Action size={15} className={phase === 'busy' ? styles.spin : undefined} />}
    </button>
  )
}
