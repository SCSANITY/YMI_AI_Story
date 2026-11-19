'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, X } from 'lucide-react'
import {
  copyRevisionKey,
  materialsEndpoint,
  type LineSelector,
  type MaterialHeader,
  type MaterialPart,
  type ProductionMaterials as Materials,
} from '@/lib/admin-production-materials'
import styles from './ProductionMaterials.module.css'

type Dedication = Materials['dedication']
type Zoom = { src: string; label: string }
type ProductionTool = { label: string; href: `https://${string}`; description: string }
const readyTools: readonly ProductionTool[] = [
  {
    label: 'Face swap · Prompt Lab',
    href: 'https://scsanity.github.io/image-prompt-lab/',
    description: 'Upload the story artwork and face reference, enter a prompt, then generate and download the edited image.',
  },
  {
    label: 'Subtitle Editor',
    href: 'https://scsanity.github.io/story-json-creator/',
    description: 'Import the story images and subtitle-template.json from Google Drive, enter the name, check the layout, and export a page PNG or the full ZIP.',
  },
]

export function ProductionTools({ tools = readyTools }: { tools?: readonly ProductionTool[] }) {
  if (!tools.length) return null
  return (
    <footer>
      <strong>Production tools</strong>
      {tools.map(({ label, href, description }) => (
        <a key={label} href={href} title={description} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} aria-hidden="true" /> {label}
        </a>
      ))}
    </footer>
  )
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={'Copy ' + label}
      title={'Copy ' + label}
      onClick={onClick}
      className={styles.icon}
    >
      <Copy size={14} />
    </button>
  )
}
function EnlargedImage({ image, close }: { image: Zoom; close: () => void }) {
  return (
    <>
      <header>
        <strong>{image.label}</strong>
        <button className={styles.icon} type="button" aria-label="Close enlarged image" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {/* Private image links are authenticated and must bypass the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.label} />
    </>
  )
}

async function readPanel(response: Response, receive: (part: MaterialPart) => void) {
  if (!response.headers.get('content-type')?.startsWith('application/x-ndjson')) {
    receive(await response.json())
    return
  }
  if (!response.body) throw new Error('Materials are temporarily unavailable.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let pending = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      const lines = (pending + chunk.value).split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) receive(JSON.parse(line) as MaterialPart)
    }
    if (pending) throw new Error('Materials could not finish loading.')
  } finally {
    reader.releaseLock()
  }
}

function Contents({ url }: { url: string }) {
  const [data, setData] = useState<(MaterialHeader & Partial<Materials>) | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  const [slide, setSlide] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [image, setImage] = useState<Zoom | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const life = useRef<AbortController | null>(null)
  const revisionRequest = useRef(0)
  const endpoint = useCallback(
    (kind: string, args?: Record<string, string>) =>
      url + (url.includes('?') ? '&' : '?') + new URLSearchParams({ kind, ...args }),
    [url]
  )

  useEffect(() => {
    const controller = new AbortController()
    life.current = controller
    fetch(url, { headers: { Accept: 'application/x-ndjson' }, cache: 'no-store', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok)
          throw new Error(
            res.status === 400 || res.status === 409
              ? 'Materials could not be verified for this book.'
              : 'Materials are temporarily unavailable.'
          )
        await readPanel(res, (part) => {
          if (controller.signal.aborted) return
          if ('lineId' in part) {
            setData(part)
            try {
              const prior = Number(localStorage.getItem(copyRevisionKey(part.viewerId, part.lineId)))
              setCopied(Number.isSafeInteger(prior) && prior > 0 ? prior : null)
            } catch {
              /* Restrictive storage settings still allow copying. */
            }
          } else {
            setData(prev => prev && { ...prev, ...part })
          }
        })
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [url, attempt])

  const refresh = useCallback(async () => {
    const id = ++revisionRequest.current
    const signal = life.current?.signal
    const res = await fetch(endpoint('dedication'), { cache: 'no-store', signal })
    if (!res.ok) {
      if (!signal?.aborted && id === revisionRequest.current && [400, 403, 409].includes(res.status))
        setError('Materials could not be verified for this book.')
      throw new Error()
    }
    const { dedication }: { dedication: Dedication } = await res.json()
    if (signal?.aborted || id !== revisionRequest.current) return undefined
    setData((prev) => prev && { ...prev, dedication })
    return dedication
  }, [endpoint])

  const dedicationLoaded = data?.dedication !== undefined
  useEffect(() => {
    if (!data?.lineId || !dedicationLoaded) return
    const focused = () => {
      if (document.visibilityState !== 'visible') return
      void refresh()
        .then((current) => {
          if (current && current.revision !== data.dedication?.revision) {
            setNotice('The dedication has changed. Review the current text.')
          }
        })
        .catch(() => {
          if (!life.current?.signal.aborted)
            setNotice('Could not refresh the dedication. Check again before using it.')
        })
    }
    window.addEventListener('focus', focused)
    document.addEventListener('visibilitychange', focused)
    return () => {
      window.removeEventListener('focus', focused)
      document.removeEventListener('visibilitychange', focused)
    }
  }, [data?.lineId, data?.dedication?.revision, dedicationLoaded, refresh])

  useEffect(() => {
    if (image) dialog.current?.showModal()
  }, [image])
  if (error)
    return (
      <div className={styles.status} role="status">
        {error}{' '}
        <button
          type="button"
          onClick={() => {
            setData(null)
            setNotice('')
            setError('')
            setAttempt((v) => v + 1)
          }}
        >
          Retry
        </button>
      </div>
    )
  if (!data)
    return (
      <p className={styles.status} role="status">
        Loading materials…
      </p>
    )

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(label + ' copied.')
    } catch {
      setNotice('Copy is unavailable. Select and copy the text manually.')
    }
  }
  async function copyDedication() {
    if (!data) return
    try {
      const current = await refresh()
      if (current === undefined) return
      if (
        !current ||
        current.revision !== data.dedication?.revision ||
        current.body !== data.dedication?.body
      ) {
        setNotice('Dedication changed. Review the latest text before copying.')
        return
      }
      if (!current.body) return
      await navigator.clipboard.writeText(current.body)
      setCopied(current.revision)
      try {
        localStorage.setItem(copyRevisionKey(data.viewerId, data.lineId), String(current.revision))
      } catch {
        /* Optional device memory. */
      }
      setNotice('Dedication copied.')
    } catch {
      setNotice('Could not verify and copy the current dedication. Try again.')
    }
  }

  const pages = data.pages ?? []
  const page = pages[slide]
  const pageArgs = page && data.previewId ? { page: String(page.index), preview: data.previewId } : undefined
  const dedication = data.dedication
  const stamp = dedication?.updatedAt && new Date(dedication.updatedAt)
  const timestamp =
    stamp && Number.isFinite(stamp.getTime())
      ? new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Hong_Kong',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(stamp) + ' HKT'
      : null
  const changed = copied !== null && dedication && copied < dedication.revision
  const photo = (label: string, src: string, stack: boolean, priority: 'high' | 'low' | 'auto' = 'auto') => (
    <button
      type="button"
      aria-label={'Enlarge ' + label}
      className={stack ? styles.stack : styles.photo}
      onClick={() => setImage({ label, src })}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={label} src={src} fetchPriority={priority} />
    </button>
  )
  return (
    <div className={styles.contents}>
      <section className={styles.gallery}>
        <h4>Preview images</h4>
        {page && pageArgs ? (
          <>
            {pages.map((entry, i) => (
              <div key={data.previewId + ':' + entry.index} hidden={slide !== i}>
                {photo(
                  entry.label,
                  endpoint('webp', { page: String(entry.index), preview: pageArgs.preview }),
                  pages.length > 1,
                  slide === i ? 'high' : 'low',
                )}
              </div>
            ))}
            <div className={styles.nav}>
              <button
                type="button"
                aria-label="Previous preview"
                disabled={slide === 0}
                onClick={() => setSlide(slide - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {page.label} · {slide + 1}/{pages.length}
              </span>
              <button
                type="button"
                aria-label="Next preview"
                disabled={slide + 1 === pages.length}
                onClick={() => setSlide(slide + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            {page.pngAvailable && (
              <a href={endpoint('png', pageArgs)} download>
                <Download size={14} /> Download PNG
              </a>
            )}
          </>
        ) : (
          <p>{data.pages ? 'Preview unavailable for this book.' : 'Loading previews…'}</p>
        )}
      </section>
      <div className={styles.fields}>
        {(
          [
            ['Purchaser', data.purchaser],
            ['Child’s name', data.child],
            ['Age at order', data.age ? `${data.age} ${data.age === '1' ? 'year' : 'years'}` : null],
            ['Book language', data.language],
          ] as const
        ).map(([label, value], i) => (
          <div key={label}>
            <small>{label}</small>
            <div>
              <strong>{value === undefined ? 'Loading…' : value ?? 'Unavailable'}</strong>
              {i < 2 && value && <CopyButton label={label} onClick={() => void copyText(value, label)} />}
            </div>
          </div>
        ))}
      </div>
      <section className={styles.dedication}>
        <header>
          <h4>Dedication</h4>
          {dedication?.body && <CopyButton label="dedication" onClick={() => void copyDedication()} />}
        </header>
        {dedication && (
          <small>
            {timestamp && 'Updated ' + timestamp + ' · '}Rev {dedication.revision}
          </small>
        )}
        {changed && (
          <p className={styles.changed}>
            {dedication?.body
              ? 'Updated since your last copy. Copy the current dedication.'
              : 'Dedication removed. Remove any previously copied text.'}
          </p>
        )}
        <div
          className={styles.message}
          tabIndex={dedication?.body ? 0 : undefined}
          aria-label="Dedication text"
        >
          {dedication ? (dedication.body ?? 'No dedication submitted.') : dedication === undefined ? 'Loading dedication…' : 'Dedication unavailable.'}
        </div>
      </section>
      <section className={styles.source}>
        <h4>Source photo</h4>
        {data.sourceAvailable ? (
          <>
            {photo('Source photo', endpoint('source'), false)}
            <a href={endpoint('source-download')} download>
              <Download size={14} /> Download
            </a>
          </>
        ) : (
          <p>{data.sourceAvailable === undefined ? 'Loading photo…' : 'Photo unavailable.'}</p>
        )}
      </section>
      <ProductionTools />
      {notice && (
        <p className={styles.feedback} role="status">
          {notice}
        </p>
      )}
      {image && (
        <dialog
          ref={dialog}
          className={styles.zoom}
          aria-label={image.label}
          onClose={() => setImage(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.stopPropagation()
          }}
          onClick={(e) => {
            if (e.target === dialog.current) dialog.current?.close()
          }}
        >
          <EnlargedImage image={image} close={() => dialog.current?.close()} />
        </dialog>
      )}
    </div>
  )
}

export function ProductionMaterialsPanel({ job, line }: { job: string; line?: LineSelector }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const url = materialsEndpoint(job, line)
  return (
    <section className={styles.panel}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        Production materials{' '}
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      <div id={id}>{open && <Contents key={url} url={url} />}</div>
    </section>
  )
}
