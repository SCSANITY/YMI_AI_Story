'use client'

import { useId, useRef, useState } from 'react'
import { Download, Pause, Play } from 'lucide-react'

function elapsed(seconds: number) {
  const whole = Math.floor(Number.isFinite(seconds) ? Math.max(0, seconds) : 0)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

// A decorative seek scale. Progress and seeking both follow the actual media element.
const bars = Array.from({ length: 52 }, (_, i) => {
  const height = 5 + 17 * Math.abs(Math.sin(i * 0.62) * Math.cos(i * 0.13))
  return `M ${i * 5 + 2} ${(28 - height) / 2} v ${height}`
}).join(' ')

export function VoiceSourcePlayer({ playbackUrl, downloadUrl, durationSeconds }: {
  playbackUrl: string
  downloadUrl: string
  durationSeconds: number
}) {
  const media = useRef<HTMLAudioElement>(null)
  const gradient = useId()
  const [duration, setDuration] = useState(durationSeconds)
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const progress = duration > 0 ? Math.min(100, 100 * position / duration) : 0

  async function togglePlayback() {
    const audio = media.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    try {
      if (failed) audio.load()
      setFailed(false)
      await audio.play()
    } catch {
      setFailed(true)
    }
  }

  return <div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#c8dbd1] bg-[#edf4ef] px-3 py-3 text-[#2c6152]">
      <audio ref={media} src={playbackUrl} preload="metadata"
        onLoadedMetadata={event => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration) }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
        onError={() => { setPlaying(false); setFailed(true) }} />
      <button type="button" aria-label={playing ? 'Pause source recording' : 'Play source recording'}
        onClick={() => void togglePlayback()} className="grid size-9 shrink-0 place-items-center rounded-full bg-[#2c6152] text-white focus-visible:outline-2">
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <label className="relative grid h-9 min-w-12 flex-1 items-center rounded focus-within:outline-2">
        <svg aria-hidden="true" viewBox="0 0 260 28" preserveAspectRatio="none" className="h-7 w-full">
          <defs><linearGradient id={gradient}><stop offset={progress + '%'} stopColor="#2c6152" /><stop offset={progress + '%'} stopColor="#aac1b5" /></linearGradient></defs>
          <path d={bars} fill="none" stroke={`url(#${gradient})`} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <input type="range" aria-label="Seek source recording" aria-valuetext={elapsed(position)}
          min={0} max={duration || 0} step="0.1" value={Math.min(position,duration) || 0}
          onChange={event => { const audio = media.current; if (audio && audio.readyState > 0) audio.currentTime = event.target.valueAsNumber }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <span className="text-xs font-semibold tabular-nums">{elapsed(position)} / {elapsed(duration)}</span>
      <a href={downloadUrl} download className="inline-flex items-center gap-1 rounded-lg border border-[#bdd0c6] bg-white px-2.5 py-2 text-xs font-bold text-[#294d40]"><Download size={14} />Download</a>
    </div>
    {failed && <p role="status" className="mt-1 text-xs">Playback unavailable. Retry playback or download the recording.</p>}
  </div>
}
