'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Send } from 'lucide-react'
import { Button } from '@/components/Button'

type SupportOrderMessageSectionProps = {
  orderId: string
  t: (key: string, params?: Record<string, string | number>) => string
}

export function SupportOrderMessageSection({ orderId, t }: SupportOrderMessageSectionProps) {
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const submittingRef = useRef(false)

  const submit = async () => {
    const normalized = message.trim()
    if (!normalized || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setNotice(null)
    try {
      const response = await fetch('/api/support/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: normalized, orderId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || t('support.submitError'))
      setMessage('')
      setNotice({
        tone: 'success',
        text: data?.ticketCode
          ? t('support.submitSuccessReference', { ticketCode: data.ticketCode })
          : t('support.submitSuccess'),
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        text: error instanceof Error ? error.message : t('support.submitError'),
      })
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-gray-900">{t('supportDetail.tellUs')}</h2>
      <textarea
        className="min-h-[140px] w-full rounded-xl border border-gray-200 p-3 text-sm"
        placeholder={t('supportDetail.placeholder')}
        value={message}
        maxLength={4000}
        onChange={(event) => {
          setMessage(event.target.value)
          setNotice(null)
        }}
      />
      <Button
        size="sm"
        className="rounded-full px-6"
        disabled={submitting || !message.trim()}
        onClick={() => void submit()}
      >
        <Send className="mr-2 h-4 w-4" />
        {submitting ? t('support.submitting') : t('support.submit')}
      </Button>
      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${
            notice.tone === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-600'
          }`}
        >
          {notice.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : null}
          {notice.text}
        </p>
      ) : null}
    </div>
  )
}
