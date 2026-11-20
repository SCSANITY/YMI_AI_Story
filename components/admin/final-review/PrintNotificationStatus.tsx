'use client'

import { useEffect, useState } from 'react'
import { AdminButton } from '@/components/admin/AdminUi'

const labels = {
  queued: 'Print email ready to send',
  sent: 'Print email sent',
  failed: 'Print email failed',
  awaiting_confirmation: 'Awaiting email confirmation. Check delivery activity before resending.',
  unavailable: 'Print email status unavailable',
  none: '',
}
type Status = keyof typeof labels

async function requestStatus(url: string, method: 'GET' | 'POST', signal?: AbortSignal): Promise<Status> {
  const response = await fetch(url, { method, cache: 'no-store', signal })
  if (!response.ok) throw new Error()
  const { status } = await response.json()
  return Object.hasOwn(labels, status) ? status as Status : 'unavailable'
}

export function PrintNotificationStatus({ jobId }: { jobId: string }) {
  const url = `/api/admin/final-jobs/${jobId}/print-notification`
  const [status,setStatus] = useState<Status>('none')
  const [busy,setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void requestStatus(url,'GET',controller.signal).then(setStatus).catch(() => {
      if (!controller.signal.aborted) setStatus('unavailable')
    })
    return () => controller.abort()
  },[url])
  if (status === 'none') return null
  const canSend = status === 'queued' || status === 'failed'
  return <div className="space-y-2 text-xs text-[var(--admin-page-muted)]" aria-live="polite">
    <p>{labels[status]}</p>
    {status !== 'sent' && <AdminButton type="button" tone="secondary" disabled={busy}
      onClick={async () => {
        setBusy(true)
        try { setStatus(await requestStatus(url,canSend ? 'POST' : 'GET')) }
        catch { setStatus('unavailable') }
        finally { setBusy(false) }
      }}>
      {canSend ? status === 'failed' ? 'Retry email' : 'Send pending email' : 'Refresh status'}
    </AdminButton>}
  </div>
}
