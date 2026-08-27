'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Mic, Square, Play, Pause, RotateCcw, Upload, AlertCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/Button'
import { uploadUserAsset } from '@/services/assets'
import { useI18n } from '@/lib/useI18n'
import {
  analyzeVoiceSampleBlob,
  type VoiceSampleQualityResult,
} from '@/lib/voice-sample-quality'
import {
  SIGNATURE_VOICE_CONSENT_VERSION,
  SIGNATURE_VOICE_MAX_SAMPLE_SECONDS,
  SIGNATURE_VOICE_MIN_SAMPLE_SECONDS,
  type SignatureVoiceSpeakerKind,
} from '@/lib/signature-voice'

type RecorderPhase = 'idle' | 'recording' | 'analyzing' | 'recorded' | 'uploading' | 'uploaded' | 'error'

type UploadResult = {
  assetId: string
  storagePath: string
  signedUrl?: string | null
  playbackUrl?: string | null
  durationSeconds: number
  speakerKind: SignatureVoiceSpeakerKind
}

type VoiceRecorderPanelProps = {
  customerId?: string
  childName: string
  existingSpeakerKind?: SignatureVoiceSpeakerKind | null
  existingAssetId?: string | null
  existingStoragePath?: string | null
  existingSignedUrl?: string | null
  existingDurationSeconds?: number | null
  validationError?: string | null
  onUploadComplete: (result: UploadResult) => void
  onReadinessChange?: (ready: boolean) => void
  onClearValidation?: () => void
}

const PROMPT_TEXT =
  'Tonight, we begin a magical story made just for you. Every page is filled with love, wonder, courage, and gentle dreams, and my voice will always be here to guide you through each adventure.'

const MIN_SECONDS = SIGNATURE_VOICE_MIN_SAMPLE_SECONDS
const MAX_SECONDS = SIGNATURE_VOICE_MAX_SAMPLE_SECONDS

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
  const safe = Math.max(0, Math.floor(seconds))
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

  if (response.status === 409) return 'bound' as const
  if (!response.ok) {
    throw new Error('Failed to delete previous voice sample')
  }
  return 'deleted' as const
}

export function VoiceRecorderPanel({
  customerId,
  childName,
  existingSpeakerKind,
  existingAssetId,
  existingStoragePath,
  existingSignedUrl,
  existingDurationSeconds,
  validationError,
  onUploadComplete,
  onReadinessChange,
  onClearValidation,
}: VoiceRecorderPanelProps) {
  const { t } = useI18n()
  const [phase, setPhase] = useState<RecorderPhase>(existingAssetId ? 'uploaded' : 'idle')
  const [seconds, setSeconds] = useState(() => Math.max(0, Number(existingDurationSeconds) || 0))
  const [localError, setLocalError] = useState<string | null>(null)
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackCompleted, setPlaybackCompleted] = useState(false)
  const [qualityResult, setQualityResult] = useState<VoiceSampleQualityResult | null>(null)
  const [speakerKind, setSpeakerKind] = useState<SignatureVoiceSpeakerKind>(
    existingSpeakerKind ?? 'current_child'
  )
  const [isAuthorizationAccepted, setIsAuthorizationAccepted] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startAtRef = useRef<number>(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const previousExistingAssetIdRef = useRef(existingAssetId)
  const justUploadedAssetIdRef = useRef<string | null>(null)

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
  const canSaveRecording =
    effectivePhase === 'recorded'
    && seconds >= MIN_SECONDS
    && seconds <= MAX_SECONDS
    && Boolean(recordedBlob)
    && qualityResult?.accepted === true
    && playbackCompleted
    && isAuthorizationAccepted
  const showPlayback = Boolean(playbackUrl)
  const showReset = Boolean(recordedBlob || existingAssetId || seconds > 0)

  const statusText = useMemo(() => {
    switch (effectivePhase) {
      case 'recording':
        return t('voiceRecorder.statusRecording', {
          current: formatTimer(seconds),
          max: formatTimer(MAX_SECONDS),
        })
      case 'recorded':
        if (qualityResult?.blockingCode) return t(`voiceRecorder.quality.${qualityResult.blockingCode}`)
        if (!playbackCompleted) return t('voiceRecorder.statusPlaybackRequired')
        return t('voiceRecorder.statusRecorded', { seconds: formatTimer(seconds) })
      case 'analyzing':
        return t('voiceRecorder.statusAnalyzing')
      case 'uploading':
        return t('voiceRecorder.statusUploading')
      case 'uploaded':
        return existingStoragePath || recordedBlob ? t('voiceRecorder.statusUploaded') : t('voiceRecorder.statusReady')
      case 'error':
        return combinedError || t('voiceRecorder.statusFailed')
      default:
        return t('voiceRecorder.statusIdle', { min: MIN_SECONDS, max: MAX_SECONDS })
    }
  }, [combinedError, effectivePhase, existingStoragePath, playbackCompleted, qualityResult, recordedBlob, seconds, t])

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
    setPlaybackCompleted(false)
    setQualityResult(null)
    onReadinessChange?.(false)
  }, [onReadinessChange, recordedUrl])

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
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' })
        if (!blob.size) {
          setPhase('error')
          setLocalError(t('voiceRecorder.errorNoAudio'))
          return
        }

        const url = URL.createObjectURL(blob)
        setRecordedBlob(blob)
        setRecordedUrl(url)
        setPhase('analyzing')
        void analyzeVoiceSampleBlob(blob)
          .then(({ durationSeconds, quality }) => {
            const normalizedDuration = Math.round(durationSeconds * 100) / 100
            setSeconds(normalizedDuration)
            setQualityResult(quality)
            setPhase('recorded')
            if (normalizedDuration < MIN_SECONDS) {
              setLocalError(t('voiceRecorder.errorMinSeconds', { seconds: MIN_SECONDS }))
            } else if (normalizedDuration > MAX_SECONDS) {
              setLocalError(t('voiceRecorder.errorMaxSeconds', { seconds: MAX_SECONDS }))
            } else if (quality.blockingCode) {
              setLocalError(t(`voiceRecorder.quality.${quality.blockingCode}`))
            }
          })
          .catch(() => {
            setPhase('error')
            setLocalError(t('voiceRecorder.errorAnalysisFailed'))
          })
      }

      recorder.start()
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - startAtRef.current) / 1000))
        setSeconds(elapsed)
        if (Date.now() - startAtRef.current >= (MAX_SECONDS - 0.5) * 1000) {
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
    if (seconds > MAX_SECONDS) {
      setLocalError(t('voiceRecorder.errorMaxSeconds', { seconds: MAX_SECONDS }))
      setPhase('recorded')
      return
    }
    if (qualityResult?.accepted !== true) {
      setLocalError(
        qualityResult?.blockingCode
          ? t(`voiceRecorder.quality.${qualityResult.blockingCode}`)
          : t('voiceRecorder.errorAnalysisFailed')
      )
      setPhase('recorded')
      return
    }
    if (!playbackCompleted) {
      setLocalError(t('voiceRecorder.statusPlaybackRequired'))
      return
    }
    if (!isAuthorizationAccepted) {
      setLocalError(t('voiceRecorder.authorizationRequired'))
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

      const asset = await uploadUserAsset(file, 'voice_sample', 'voice', customerId, {
        metadata: {
          quality: qualityResult.metrics,
        },
        voiceAuthorization: {
          accepted: true,
          version: SIGNATURE_VOICE_CONSENT_VERSION,
          speakerKind,
        },
      })
      const verifiedDuration = Number(asset.metadata?.duration_seconds)
      justUploadedAssetIdRef.current = asset.asset_id
      setPhase('uploaded')
      onUploadComplete({
        assetId: asset.asset_id,
        storagePath: asset.storage_path,
        signedUrl: null,
        playbackUrl: asset.playback_url ?? null,
        durationSeconds: Number.isFinite(verifiedDuration) ? verifiedDuration : seconds,
        speakerKind,
      })
      onReadinessChange?.(true)

      if (previousAssetId && previousAssetId !== asset.asset_id) {
        deleteVoiceAsset(previousAssetId, customerId).catch((error) => {
          console.warn('[VoiceRecorderPanel] Failed to delete previous voice sample', error)
        })
      }
    } catch {
      setPhase('error')
      setLocalError(t('voiceRecorder.errorUploadFailed'))
    }
  }, [customerId, existingAssetId, isAuthorizationAccepted, onClearValidation, onReadinessChange, onUploadComplete, playbackCompleted, qualityResult, recordedBlob, seconds, speakerKind, t])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleEnded = () => {
      setIsPlaying(false)
      setPlaybackCompleted(true)
      if (!recordedBlob && existingAssetId) onReadinessChange?.(true)
    }
    const handlePause = () => setIsPlaying(false)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('pause', handlePause)
    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('pause', handlePause)
    }
  }, [existingAssetId, onReadinessChange, playbackUrl, recordedBlob])

  useEffect(() => {
    if (previousExistingAssetIdRef.current === existingAssetId) return
    previousExistingAssetIdRef.current = existingAssetId
    // The selected asset can be restored or replaced by the parent workflow.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(Math.max(0, Number(existingDurationSeconds) || 0))
    if (justUploadedAssetIdRef.current === existingAssetId) {
      justUploadedAssetIdRef.current = null
      return
    }
    setPlaybackCompleted(false)
    onReadinessChange?.(false)
  }, [existingAssetId, existingDurationSeconds, onReadinessChange])

  useEffect(() => {
    if (!existingSpeakerKind) return
    // The parent may restore a persisted voice asset after the recorder mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeakerKind(existingSpeakerKind)
  }, [existingSpeakerKind])

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
    <div className="mt-4 overflow-hidden rounded-3xl border border-orange-100/80 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,246,235,0.78))] shadow-[0_18px_42px_rgba(154,95,38,0.12),inset_0_1px_0_rgba(255,255,255,0.95)]">
      <div className="border-b border-orange-100/70 px-4 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-200/80 bg-orange-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
            <Sparkles className="h-3.5 w-3.5" />
            {t('voiceRecorder.badge')}
          </div>
        </div>
        <h5 className="text-base font-bold text-slate-950">{t('voiceRecorder.title')}</h5>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            t('voiceRecorder.stepRecord'),
            t('voiceRecorder.stepSave'),
            t('voiceRecorder.stepNarration'),
          ].map((item, index) => (
            <div key={item} className="flex items-start gap-2 rounded-2xl border border-white/80 bg-white/72 px-3 py-3 text-xs font-semibold leading-5 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-700">
                {index + 1}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="rounded-3xl border border-amber-100/90 bg-gradient-to-br from-amber-50/95 via-white/90 to-orange-50/80 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-700">{t('voiceRecorder.promptIntro')}</div>
          <p className="text-sm font-semibold leading-7 text-slate-800">{PROMPT_TEXT}</p>
        </div>

        <section className="rounded-3xl border border-orange-100/90 bg-white/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.96)]">
          <div className="text-sm font-bold text-slate-900">{t('voiceRecorder.speakerTitle')}</div>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('voiceRecorder.speakerTitle')}>
            {([
              ['current_child', t('voiceRecorder.speakerChild', { name: childName.trim() || t('voiceRecorder.speakerChildFallback') })],
              ['adult', t('voiceRecorder.speakerAdult')],
            ] as const).map(([value, label]) => {
              const selected = speakerKind === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setSpeakerKind(value)
                    setIsAuthorizationAccepted(false)
                    setLocalError(null)
                  }}
                  className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors ${
                    selected
                      ? 'border-orange-300 bg-orange-50 text-orange-800 shadow-sm'
                      : 'border-slate-200 bg-white/80 text-slate-600 hover:border-orange-200 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/86 p-3 text-xs leading-5 text-slate-700 sm:text-sm">
            <input
              type="checkbox"
              aria-required="true"
              checked={isAuthorizationAccepted}
              onChange={(event) => {
                setIsAuthorizationAccepted(event.target.checked)
                if (event.target.checked) setLocalError(null)
              }}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-500 focus:ring-orange-400"
            />
            <span>
              {speakerKind === 'current_child'
                ? t('voiceRecorder.authorizationChild')
                : t('voiceRecorder.authorizationAdult')}{' '}
              <Link href="/privacy" target="_blank" className="font-semibold text-orange-700 underline underline-offset-2">
                {t('personalize.privacyPolicy')}
              </Link>
            </span>
          </label>
        </section>

        <div className="rounded-3xl border border-white/80 bg-white/86 p-4 shadow-[0_12px_26px_rgba(15,23,42,0.06),inset_0_1px_0_rgba(255,255,255,0.94)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${combinedError ? 'text-red-600' : 'text-slate-800'}`}>{statusText}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                {t('voiceRecorder.secureNote')}
              </div>
            </div>
            <div className={`self-start rounded-2xl border px-4 py-2 font-mono text-lg font-bold shadow-sm ${
              effectivePhase === 'recording'
                ? 'border-red-200 bg-red-50 text-red-600'
                : 'border-orange-100 bg-orange-50/80 text-orange-700'
            }`}>
              {formatTimer(seconds)}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {effectivePhase === 'recording' ? (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={stopRecording}
                className="glass-action-btn glass-action-btn--amber h-11 flex-1 rounded-2xl border-red-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(255,245,245,0.74))] text-sm font-semibold text-red-700 shadow-[0_14px_30px_rgba(239,68,68,0.12),inset_0_1px_0_rgba(255,255,255,0.92)] hover:text-red-800 sm:h-12"
              >
                <Square className="mr-2 h-4 w-4" />
                {t('voiceRecorder.stop')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={handleStartRecording}
                disabled={effectivePhase === 'uploading'}
                className="glass-action-btn glass-action-btn--brand h-11 flex-1 rounded-2xl text-sm font-semibold sm:h-12"
              >
                <Mic className="mr-2 h-4 w-4" />
                {recordedBlob || existingAssetId ? t('voiceRecorder.recordAgain') : t('voiceRecorder.startRecording')}
              </Button>
            )}

            {showPlayback ? (
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={handleTogglePlayback}
                disabled={effectivePhase === 'recording' || effectivePhase === 'uploading'}
                className="glass-action-btn glass-action-btn--neutral h-11 rounded-2xl text-sm font-semibold text-slate-700 sm:h-12 sm:min-w-28"
              >
                {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {isPlaying ? t('voiceRecorder.pause') : t('voiceRecorder.play')}
              </Button>
            ) : null}

            {showReset ? (
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
                className="glass-action-btn glass-action-btn--neutral h-11 rounded-2xl text-sm font-semibold text-slate-700 sm:h-12 sm:min-w-28"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('voiceRecorder.reset')}
              </Button>
            ) : null}
          </div>

          {effectivePhase === 'recorded' || effectivePhase === 'uploading' || effectivePhase === 'analyzing' ? (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleUpload}
              disabled={phase === 'uploading' || phase === 'analyzing' || !canSaveRecording}
              className="glass-action-btn glass-action-btn--brand mt-3 h-11 w-full rounded-2xl text-sm font-semibold sm:h-12"
            >
              <Upload className="mr-2 h-4 w-4" />
              {effectivePhase === 'uploading' ? t('voiceRecorder.uploading') : t('voiceRecorder.useThisRecording')}
            </Button>
          ) : null}
        </div>
      </div>

      {combinedError ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{combinedError}</span>
        </div>
      ) : null}

      {qualityResult?.warningCode ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t(`voiceRecorder.quality.${qualityResult.warningCode}`)}</span>
        </div>
      ) : null}

      <audio ref={audioRef} src={playbackUrl ?? undefined} preload="metadata" className="hidden" />
    </div>
  )
}
