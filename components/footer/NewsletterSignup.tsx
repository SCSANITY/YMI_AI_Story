'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Mail } from 'lucide-react'

type NewsletterSignupProps = {
  t: (key: string, params?: Record<string, string | number>) => string
}

export function NewsletterSignup({ t }: NewsletterSignupProps) {
  const [subscriberEmail, setSubscriberEmail] = useState('')
  const [subscribeStatus, setSubscribeStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [subscribeMessage, setSubscribeMessage] = useState('')
  const isSubmittingRef = useRef(false)

  const handleSubscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmittingRef.current) return
    const email = subscriberEmail.trim()
    if (!email) {
      setSubscribeStatus('error')
      setSubscribeMessage(t('footer.subscribeInvalid'))
      return
    }

    isSubmittingRef.current = true
    setSubscribeStatus('submitting')
    setSubscribeMessage('')

    try {
      const response = await fetch('/api/newsletter-subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || t('footer.subscribeError'))
      }
      setSubscriberEmail('')
      setSubscribeStatus('success')
      setSubscribeMessage(t('footer.subscribeSuccess'))
    } catch (error) {
      setSubscribeStatus('error')
      setSubscribeMessage(error instanceof Error ? error.message : t('footer.subscribeError'))
    } finally {
      isSubmittingRef.current = false
    }
  }

  return (
    <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="email"
          value={subscriberEmail}
          onChange={(event) => {
            setSubscriberEmail(event.target.value)
            if (subscribeStatus !== 'submitting') {
              setSubscribeStatus('idle')
              setSubscribeMessage('')
            }
          }}
          className="h-11 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm"
          placeholder={t('footer.emailPlaceholder')}
        />
      </div>
      <button
        type="submit"
        disabled={subscribeStatus === 'submitting'}
        className="h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {subscribeStatus === 'submitting' ? t('footer.subscribing') : t('footer.subscribe')}
      </button>
      {subscribeMessage ? (
        <div
          className={`rounded-xl border px-3 py-2 text-xs font-semibold leading-5 ${
            subscribeStatus === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
              : 'border-rose-100 bg-rose-50 text-rose-600'
          }`}
        >
          {subscribeMessage}
        </div>
      ) : null}
    </form>
  )
}
