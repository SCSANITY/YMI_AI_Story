'use client'

import { useEffect, useState, type FormEvent } from 'react'
import styles from './GuestPreviewEmail.module.css'

const endpoint = '/api/guest/preview-email'

export function GuestPreviewEmail() {
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState('')
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(endpoint, { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data?.guest || controller.signal.aborted) return
        const email = data.email ?? ''
        setAddress(email)
        setSaved(email)
        setEditing(!email)
        setVisible(true)
      }).catch(() => {})
    return () => controller.abort()
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: address }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not save your email. Please try again.')
      setSaved(result.email)
      setAddress(result.email)
      setEditing(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your email. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!visible) return null
  return <section className={styles.mail} aria-label="PDF email">
    {editing ? <form onSubmit={save}>
      <label htmlFor="guest-preview-address">Where should we send your PDF after purchase?</label>
      <div className={styles.controls}>
        <input id="guest-preview-address" type="email" autoComplete="email" placeholder="Email address"
          aria-describedby="guest-preview-purpose" required maxLength={254} value={address}
          onChange={event => setAddress(event.target.value)} disabled={busy}/>
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      <p id="guest-preview-purpose" className={styles.hint}>We’ll also send a weekly reminder if you leave a book in your cart.</p>
      {error && <p role="alert">{error}</p>}
    </form> : <div className={styles.saved}>
      <div role="status"><strong>✓　Email saved</strong><small>{saved}</small></div>
      <button type="button" onClick={() => setEditing(true)}>Edit</button>
    </div>}
  </section>
}
