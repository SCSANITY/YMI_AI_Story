'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { BookOpen, Sparkles } from 'lucide-react'
import { PreviewCapacityNotice } from './PreviewCapacityNotice'
import { getPreviewGenerationEstimate } from './preview-generation-estimate'

type Props = {
  startedAt: number | null
  title: string
  body: string
  estimateLabel: string
  stillWorking: string
  capacityWaiting: boolean
  capacityTitle: string
  capacityBody: string
  error: string | null
  retryLabel: string
  onReturnToDetails: () => void
}

function PreviewGeneratingCoverComponent(props: Props) {
  const mountedAt = useRef<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    const origin = props.startedAt ?? (mountedAt.current ??= Date.now())
    const tick = () => setElapsedMs(Date.now() - origin)
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [props.startedAt])
  const { countdownSeconds, fraction } = getPreviewGenerationEstimate(elapsedMs)

  return (
    <div data-preview-generating-cover="true" className="relative flex h-full w-full flex-col items-center justify-center overflow-y-auto rounded-r-lg border border-amber-200/80 bg-gradient-to-br from-[#fff9e8] via-[#fff2d7] to-[#ffe4c8] px-5 text-center shadow-[inset_7px_0_12px_-10px_rgba(120,53,15,0.45)] md:px-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-2 border-r border-amber-200/60 bg-amber-100/70" />
      <div aria-hidden="true" className={`${props.capacityWaiting ? 'hidden' : 'hidden md:flex'} mb-4 h-14 w-14 items-center justify-center rounded-2xl border border-white bg-white/65 text-amber-700`}>
        <BookOpen className="h-9 w-9" />
        <Sparkles className="absolute ms-12 -mt-10 h-5 w-5 motion-safe:animate-pulse" />
      </div>
      <p role="status" className="max-w-[290px] font-serif text-lg font-bold leading-tight text-slate-950 md:text-2xl">{props.error ? props.retryLabel : props.capacityWaiting ? props.capacityTitle : props.title}</p>
      {!props.capacityWaiting || props.error ? <p className={`${props.error ? 'max-h-16 overflow-y-auto' : 'hidden md:block'} mt-3 max-w-[290px] text-xs leading-5 text-slate-600 md:text-sm md:leading-6`}>{props.error ?? props.body}</p> : null}
      <div className="hidden md:block"><PreviewCapacityNotice visible={props.capacityWaiting && !props.error} variant="loading" title={props.capacityTitle} body={props.capacityBody} /></div>
      {props.error ? (
        <button type="button" onClick={props.onReturnToDetails} className="mt-5 min-h-11 rounded-full bg-amber-600 px-5 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">{props.retryLabel}</button>
      ) : (
        <div className="mt-3 flex flex-col items-center gap-2 md:mt-5">
          <span className="relative flex h-16 w-16 items-center justify-center">
            <svg aria-hidden="true" viewBox="0 0 64 64" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" stroke="#fcd9a0" strokeWidth="3" />
              <circle cx="32" cy="32" r="28" fill="none" stroke="#d97706" strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={fraction} strokeLinecap="round" className="transition-[stroke-dashoffset] duration-700 ease-linear motion-reduce:transition-none" />
            </svg>
            <span role="timer" aria-live="off" className="text-lg font-bold tabular-nums text-amber-900">{countdownSeconds > 0 ? `${countdownSeconds}s` : <Sparkles className="h-5 w-5" aria-hidden="true" />}</span>
          </span>
          <span className="text-xs font-semibold text-amber-800">{countdownSeconds > 0 ? props.estimateLabel : props.stillWorking}</span>
        </div>
      )}
    </div>
  )
}

export const PreviewGeneratingCover = memo(PreviewGeneratingCoverComponent)
