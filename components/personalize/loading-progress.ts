export const PREVIEW_ESTIMATE_SECONDS = 150
export const PREVIEW_ESTIMATE_PROGRESS_CAP = 94

const PREVIEW_OVERRUN_PROGRESS_CAP = 97
const PREVIEW_OVERRUN_WINDOW_MS = 120_000

export type PreviewLoadingEstimate = {
  progress: number
  countdownSeconds: number
  phase: 'estimating' | 'finalizing'
}

export function getPreviewLoadingEstimate(elapsedMs: number): PreviewLoadingEstimate {
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  const estimateMs = PREVIEW_ESTIMATE_SECONDS * 1000

  if (safeElapsedMs < estimateMs) {
    const ratio = safeElapsedMs / estimateMs
    return {
      progress: ratio * PREVIEW_ESTIMATE_PROGRESS_CAP,
      countdownSeconds: Math.ceil((estimateMs - safeElapsedMs) / 1000),
      phase: 'estimating',
    }
  }

  const overrunRatio = Math.min(1, (safeElapsedMs - estimateMs) / PREVIEW_OVERRUN_WINDOW_MS)
  return {
    progress: PREVIEW_ESTIMATE_PROGRESS_CAP
      + overrunRatio * (PREVIEW_OVERRUN_PROGRESS_CAP - PREVIEW_ESTIMATE_PROGRESS_CAP),
    countdownSeconds: 0,
    phase: 'finalizing',
  }
}

export function formatPreviewCountdown(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}
