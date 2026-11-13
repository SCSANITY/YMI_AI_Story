'use client'

import { useEffect, useState } from 'react'
import { useGlobalContext } from '@/contexts/GlobalContext'

const ENDPOINT = '/api/user/cart-reminder-preference'
const buttonClass = 'rounded-full border border-amber-400 px-5 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-amber-600 disabled:opacity-60'
type Preference = { enabled: boolean; canEnable: boolean; paused: boolean }

function MemberPreference({ userId }: { userId: string }) {
  const [preference, setPreference] = useState<Preference | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(ENDPOINT, {
          cache: 'no-store', signal: controller.signal, headers: { 'X-YMI-Preference-User': userId },
        })
        if (!response.ok) throw new Error()
        const current = await response.json() as Preference
        if (!controller.signal.aborted) setPreference(current)
      } catch {
        if (!controller.signal.aborted) setError('Could not load your email preferences.')
      }
    })()
    return () => controller.abort()
  }, [retry, userId])

  async function save(enabled: boolean) {
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'X-YMI-Preference-User': userId, 'X-YMI-Cart-Reminders': enabled ? 'on' : 'off' },
      })
      if (!response.ok) throw new Error()
      const result = await response.json() as Pick<Preference, 'enabled'>
      setPreference((current) => current && { ...current, enabled: result.enabled, paused: false })
      setNotice(enabled ? 'Cart reminders are on.' : 'Cart reminders are off.')
    } catch {
      setError('Could not save your choice. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {!preference && !error && <p role="status">Loading your preference…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!preference && error && <button className={buttonClass} type="button" onClick={() => {
        setError('')
        setRetry((n) => n + 1)
      }}>Try again</button>}
      {preference && (
        <div className="space-y-3">
          {preference.paused && <p className="text-sm text-slate-600">Reminders are paused because your account email changed or isn’t confirmed.</p>}
          <div className="flex flex-wrap items-center gap-3">
            {(!preference.enabled || preference.paused) && <button className={buttonClass} type="button"
              disabled={saving || !preference.canEnable} onClick={() => { void save(true) }}>
              {preference.paused ? 'Turn on for my current email' : 'Turn on cart reminders'}
            </button>}
            {preference.enabled && <button className={buttonClass} type="button"
              disabled={saving} onClick={() => { void save(false) }}>Turn off cart reminders</button>}
          </div>
          {!preference.canEnable && <p className="text-sm text-slate-600">Confirm your current account email before turning on reminders.</p>}
          <p role="status" className="text-sm text-slate-600">{saving ? 'Saving…' : notice}</p>
        </div>
      )}
    </>
  )
}

export function CartReminderPreference() {
  const { user, isAuthResolved, openLoginModal } = useGlobalContext()
  return (
    <section aria-labelledby="cart-reminder-heading" className="space-y-4 rounded-2xl border border-amber-100 bg-white p-6 text-slate-800">
      <h2 id="cart-reminder-heading" className="font-title text-2xl font-semibold">Weekly shopping cart reminders</h2>
      <p>With your permission, YMI Story will use your account email to send up to one promotional reminder a week about books you left in your cart. You can turn reminders off here or unsubscribe from any reminder email, free of charge.</p>
      {!isAuthResolved && !user ? <p role="status">Checking your account…</p>
        : user ? <MemberPreference key={user.id} userId={user.id} />
          : <button type="button" className={buttonClass} onClick={() => openLoginModal()}>Sign in to manage email preferences</button>}
    </section>
  )
}
