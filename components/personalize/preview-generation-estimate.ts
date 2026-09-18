export const PREVIEW_ESTIMATE_SECONDS = 70

// This is a waiting estimate, never a provider completion or purchase signal.
export function getPreviewGenerationEstimate(elapsedMs: number) {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  return {
    countdownSeconds: Math.max(0, Math.ceil(PREVIEW_ESTIMATE_SECONDS - elapsed / 1000)),
    fraction: Math.min(1, elapsed / (PREVIEW_ESTIMATE_SECONDS * 1000)),
  }
}
