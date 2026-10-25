'use client'

import { useEffect, useState } from 'react'
import { restorePreviewVersionGroup } from '@/services/preview-version-group'

export function usePreviewVersionGroup(creationId: string | null, jobId: string | null, ownerKey: string, enabled: boolean) {
  const key = enabled && creationId && jobId ? `${ownerKey}:${creationId}:${jobId}` : null
  const [result, setResult] = useState<{
    key: string; signal: AbortSignal; group?: Awaited<ReturnType<typeof restorePreviewVersionGroup>>; error?: string
  } | null>(null)
  useEffect(() => {
    if (!key || !creationId) return
    const controller = new AbortController()
    void restorePreviewVersionGroup(creationId, controller.signal).then(group => {
      if (!controller.signal.aborted) setResult({ key, signal: controller.signal, group })
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ key, signal: controller.signal, error: 'Your photo versions could not be loaded. Please return to My Books and reopen this Preview.' })
    })
    return () => controller.abort()
  }, [key, creationId])
  const current = key && result?.key === key && !result.signal.aborted ? result : null
  return { group: current?.group ?? null, error: current?.error ?? null,
    ready: Boolean(key && current?.group && current.group.selectedJobId === jobId) }
}
