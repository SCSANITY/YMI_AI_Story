'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Square, Play, Pause, RotateCcw, Upload, CheckCircle2, AlertCircle, Volume2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { uploadUserAsset } from '@/services/assets'
import { useI18n } from '@/lib/useI18n'

type RecorderPhase = 'idle' | 'recording' | 'recorded' | 'uploading' | 'uploaded' | 'error'

type UploadResult = {
  assetId: string
  storagePath: string
  signedUrl?: string | null
  durationSeconds: number
}

type VoiceRecorderPanelProps = {
  customerId?: string
  existingAssetId?: string | null
  existingStoragePath?: string | null
  existingSignedUrl?: string | null
  validationError?: string | null
  onUploadComplete: (result: UploadResult) => void
  onClearValidation?: () => void
}

const PROMPT_TEXT =
  'Tonight, we begin a magical story, and every page is filled with love, wonder, and gentle dreams.'

const MIN_SECONDS = 10
const MAX_SECONDS = 15

function getPreferredMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function getFileExtension(mimeType: string) {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('webm')) return 'webm'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'bin'
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, seconds)
  const mins = Math.floor(safe / 60)
  const secs = safe % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

async function deleteVoiceAsset(assetId: string, customerId?: string) {
  const response = await fetch('/api/user-assets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      assetId,
      customerId: customerId ?? null,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to delete previous voice sample')
  }
}

export function VoiceRecorderPanel({
  customerId,
  existingAssetId,
  existingStoragePath,
  existingSignedUrl,
  validationError,
  onUploadComplete,
  onClearValidation,
}: VoiceRecorderPanelProps) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<RecorderPhase>(existingAssetId ? 'uploaded' : 'idle')
  const [seconds, setSeconds] = useState(0)
  const [localError, setLocalError] = useState<string | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startAtRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playbackUrl = recordedUrl || existingSignedUrl || null
  const combinedError = validationError || localError
  const effectivePhase: RecorderPhase =
    recordedBlob
      ? phase
      : existingAssetId && phase === 'idle'
        ? 'uploaded'
        : !existingAssetId && phase === 'uploaded'
          ? 'idle'
          : phase
  const canUpload = effectivePhase === 'recorded' && seconds >= MIN_SECONDS && Boolean(recordedBlob)

  const statusText = useMemo(() => {
    switch (effectivePhase) {
      case 'recording':
        return t('voiceRecorder.statusRecording', {
          current: formatTimer(seconds),
          max: formatTimer(MAX_SECONDS),
        })
      case 'recorded':
        return seconds >= MIN_SECONDS
          ? t('voiceRecorder.statusRecorded', { seconds: formatTimer(seconds) })
          : t('voiceRecorder.statusMinSeconds', { seconds: MIN_SECONDS })
      case 'uploading':
        return t('voiceRecorder.statusUploading')
      case 'uploaded':
        return existingStoragePath || recordedBlob ? t('voiceRecorder.statusUploaded') : t('voiceRecorder.statusReady')
      case 'error':
        return combinedError || t('voiceRecorder.statusFailed')
      default:
        return t('voiceRecorder.statusIdle', { min: MIN_SECONDS, max: MAX_SECONDS })
    }
  }, [combinedError, effectivePhase, existingStoragePath, recordedBlob, seconds, t])

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetLocalRecording = useCallback(() => {
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl)
    }
    setRecordedBlob(null)
    setRecordedUrl(null)
    setSeconds(0)
    setLocalError(null)
    setIsPlaying(false)
  }, [recordedUrl])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    clearTimer()
    stopTracks()
  }, [clearTimer, stopTracks])

  const handleStartRecording = useCallback(async () => {
    onClearValidation?.()
    setLocalError(null)
    setIsPlaying(false)
    audioRef.current?.pause()
    resetLocalRecording()

    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPhase('error')
      setLocalError(t('voiceRecorder.errorUnsupported'))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getPreferredMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)

      streamRef.current = stream
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      startAtRef.current = Date.now()
      setSeconds(0)
      setPhase('recording')

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        clearTimer()
        stopTracks()
        const durationSeconds = Math.max(1, Math.round((Date.now() - startAtRef.current) / 1000))
        setSeconds(durationSeconds)

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
        if (!blob.size) {
          setPhase('error')
          setLocalError(t('voiceRecorder.errorNoAudio'))
          return
        }

        const url = URL.createObjectURL(blob)
        setRecordedBlob(blob)
        setRecordedUrl(url)
        setPhase('recorded')

        if (durationSeconds < MIN_SECONDS) {
          setLocalError(t('voiceRecorder.errorMinSeconds', { seconds: MIN_SECONDS }))
        }
      }

      recorder.start()
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - startAtRef.current) / 1000))
        setSeconds(elapsed)
        if (elapsed >= MAX_SECONDS) {
          stopRecording()
        }
      }, 250)
    } catch {
      setPhase('error')
      setLocalError(t('voiceRecorder.errorPermission'))
      stopTracks()
    }
  }, [clearTimer, onClearValidation, resetLocalRecording, stopRecording, stopTracks, t])

  const handleTogglePlayback = useCallback(() => {
    if (!audioRef.current || !playbackUrl) return
    onClearValidation?.()
    if (audioRef.current.paused) {
      void audioRef.current.play()
      setIsPlaying(true)
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [onClearValidation, playbackUrl])

  const handleUpload = useCallback(async () => {
    if (!recordedBlob) return
    onClearValidation?.()

    if (seconds < MIN_SECONDS) {
      setLocalError(t('voiceRecorder.errorMinSeconds', { seconds: MIN_SECONDS }))
      setPhase('recorded')
      return
    }

    try {
      setPhase('uploading')
      setLocalError(null)
      const previousAssetId = existingAssetId
      const mimeType = recordedBlob.type || 'audio/webm'
      const extension = getFileExtension(mimeType)
      const file = new File([recordedBlob], `voice-sample.${extension}`, {
        type: mimeType,
        lastModified: Date.now(),
      })

      const asset = await uploadUserAsset(file, 'voice_sample', 'voice', customerId)
      setPhase('uploaded')
      onUploadComplete({
        assetId: asset.asset_id,
        storagePath: asset.storage_path,
        signedUrl: asset.signed_url ?? null,
        durationSeconds: seconds,
      })

      if (previousAssetId && previousAssetId !== asset.asset_id) {
        deleteVoiceAsset(previousAssetId, customerId).catch((error) => {
          console.warn('[VoiceRecorderPanel] Failed to delete previous voice sample', error)
        })
      }
    } catch {
      setPhase('error')
      setLocalError(t('voiceRecorder.errorUploadFailed'))
    }
  }, [customerId, existingAssetId, onClearValidation, onUploadComplete, recordedBlob, seconds, t])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => setIsPlaying(false)
    const handlePause = () => setIsPlaying(false)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
    }
  }, [playbackUrl])

  useEffect(() => {
    return () => {
      clearTimer()
      stopTracks()
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl)
      }
    }
  }, [clearTimer, recordedUrl, stopTracks])

  return (
    <div className="mt-4 rounded-3xl border border-white/70 bg-white/78 p-4 shadow-[0_14px_34px_rgba(148,93,34,0.1),inset_0_1px_0_rgba(255,255,255,0.92)] backdrop-blur-xl sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Volume2 className="h-5 w-5 text-amber-500" />
        <h5 className="text-sm font-bold text-gray-900">{t('voiceRecorder.title')}</h5>
      </div>

      <p className="mb-3 text-sm text-gray-600">{t('voiceRecorder.promptIntro')}</p>
      <div className="mb-4 rounded-3xl border border-amber-100/90 bg-gradient-to-br from-amber-50/90 via-white/85 to-orange-50/70 px-4 py-4 text-sm font-medium leading-7 text-gray-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
        {PROMPT_TEXT}
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-3xl border border-white/80 bg-white/88 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.92)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">{t('voiceRecorder.statusLabel')}</div>
          <div className={`text-sm ${combinedError ? 'text-red-600' : 'text-gray-700'}`}>{statusText}</div>
        </div>
        <div className={`self-start text-sm font-mono rounded-full px-3 py-1.5 shadow-sm ${phase === 'recording' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-white text-gray-500 border border-gray-200'}`}>
          {formatTimer(seconds)}
        </div>
      </div>

      <div className="space-y-3">
        {effectivePhase === 'recording' ? (
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={stopRecording}
            className="glass-action-btn glass-action-btn--amber h-11 w-full rounded-2xl border-red-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.84),rgba(255,245,245,0.68))] text-red-700 shadow-[0_14px_30px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,0.92)] hover:text-red-800 sm:h-12"
          >
            <Square className="mr-2 h-4 w-4" />
            {t('voiceRecorder.stop')}
          </Button>
        ) : null}

        {effectivePhase !== 'recording' ? (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleStartRecording}
            className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-2xl text-sm font-semibold sm:h-12"
          >
            <Mic className="mr-2 h-4 w-4" />
            {recordedBlob || existingAssetId ? t('voiceRecorder.recordAgain') : t('voiceRecorder.startRecording')}
          </Button>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={handleTogglePlayback}
            disabled={!playbackUrl || effectivePhase === 'recording' || effectivePhase === 'uploading'}
            className="glass-action-btn glass-action-btn--neutral h-11 rounded-2xl text-sm font-semibold text-gray-700 sm:h-12"
          >
            {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {isPlaying ? t('voiceRecorder.pause') : t('voiceRecorder.play')}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => {
              onClearValidation?.()
              setLocalError(null)
              audioRef.current?.pause()
              setIsPlaying(false)
              resetLocalRecording()
              if (!existingAssetId) {
                setPhase('idle')
              } else {
                setPhase('uploaded')
              }
            }}
            disabled={effectivePhase === 'recording' || effectivePhase === 'uploading'}
            className="glass-action-btn glass-action-btn--neutral h-11 rounded-2xl text-sm font-semibold text-slate-700 sm:h-12"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('voiceRecorder.reset')}
          </Button>
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={handleUpload}
          disabled={phase === 'uploading' || !canUpload}
          className="glass-action-btn glass-action-btn--brand h-11 w-full rounded-2xl text-sm font-semibold sm:h-12"
        >
          {effectivePhase === 'uploaded' ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
          {effectivePhase === 'uploaded'
            ? t('voiceRecorder.uploaded')
            : effectivePhase === 'uploading'
              ? t('voiceRecorder.uploading')
              : t('voiceRecorder.useThisRecording')}
        </Button>
      </div>

      {combinedError ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{combinedError}</span>
        </div>
      ) : null}

      <audio ref={audioRef} src={playbackUrl ?? undefined} preload="metadata" className="hidden" />
    </div>
  )
}
