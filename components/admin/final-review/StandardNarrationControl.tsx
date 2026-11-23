'use client'

import { useState } from 'react'
import type { StandardNarrationChoice } from '@/lib/finalReview'

type Props = {
  job: string
  choice: StandardNarrationChoice
  onConfirmed: (job: string, choice: StandardNarrationChoice) => void
}

export function StandardNarrationControl({ job, choice, onConfirmed }: Props) {
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const button = 'rounded-lg border border-current px-3 py-1.5 text-sm font-medium disabled:opacity-50'

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/final-jobs/${job}/standard-narration`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proofRevision: choice.proofRevision, voiceRevision: choice.voiceRevision }),
      })
      const result = await response.json()
      if (!response.ok || !result.choice?.confirmedAt) throw new Error(result.error || 'Could not confirm standard narration')
      onConfirmed(job, result.choice)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not confirm standard narration')
    } finally {
      setSaving(false)
    }
  }

  return <section className="my-3 rounded-xl border p-4" aria-label="Standard narration">
    <h3 className="font-semibold">Standard narration</h3>
    {choice.confirmedAt ? <p role="status">Confirmed for this proof.</p> : <>
      <p className="my-2 text-sm">{reviewing ? 'Use standard narration for this book when releasing it to print?' : 'No parent recording has been submitted for this book.'}</p>
      {reviewing ? <div className="flex gap-2">
        <button type="button" className={button} disabled={saving} onClick={confirm}>Confirm standard narration</button>
        <button type="button" className={button} disabled={saving} onClick={() => { setReviewing(false); setError('') }}>Cancel</button>
      </div> : <button type="button" className={button} onClick={() => setReviewing(true)}>Use standard narration</button>}
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    </>}
  </section>
}
