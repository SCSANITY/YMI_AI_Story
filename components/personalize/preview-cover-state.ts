import type { PreviewJobPhase } from '@/lib/preview-job-state'
import type { PreviewAccessState } from './usePreviewController'

// Job identity is available before its image. That is not saved-result recovery.
export function getPreviewCoverState({
  ready, access, phase, locallyStarted, hasError,
}: {
  ready: boolean
  access: PreviewAccessState
  phase: PreviewJobPhase
  locallyStarted: boolean
  hasError: boolean
}) {
  if (ready) return 'ready'
  if (access === 'unavailable') return 'unavailable'
  if (hasError) return 'error'
  if (locallyStarted || (access === 'available' && phase === 'pending')) return 'generating'
  return 'restoring'
}
