'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useGlobalContext } from '@/contexts/GlobalContext'
import { formatCurrencyAmount } from '@/lib/locale-pricing'
import { templateStorageUrl } from '@/lib/book-catalog'
import type { OriginalFormat, OriginalOffer } from '@/lib/original-book-offers'

const formats = [
  { id: 'digital', label: 'PDF only', detail: 'Digital download' },
  { id: 'basic', label: 'Hardcover', detail: 'Printed book and digital PDF' },
  { id: 'supreme', label: 'Hardcover + Voice', detail: 'Printed book and digital PDF. Add your voice for narration after payment.' },
] as const

export function OriginalFormatSelection({ story, title, offers }: { story: string; title: string; offers: OriginalOffer[] }) {
  const { displayCurrency } = useGlobalContext()
  const [format, select] = useState<OriginalFormat | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [changed, setChanged] = useState(false)
  const submitting = useRef(false)
  const attempts = useRef(new Map<string, string>())
  const offer = offers.find(row => row.format === format)
  const cover = templateStorageUrl((offer ?? offers[0]).coverPath)

  async function start() {
    if (!offer || submitting.current || changed) return
    submitting.current = true
    setBusy(true)
    setError('')
    const storageKey = 'ymi_original_attempt:' + JSON.stringify([story, offer.format, offer.priceVersion, offer.sourceVersion])
    let id = attempts.current.get(storageKey)
    try {
      try { id ??= sessionStorage.getItem(storageKey) ?? undefined } catch {}
      id ??= crypto.randomUUID()
      attempts.current.set(storageKey, id)
      try { sessionStorage.setItem(storageKey, id) } catch {}
      const res = await fetch('/api/orders/original', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ story, format: offer.format, priceVersion: offer.priceVersion,
          sourceVersion: offer.sourceVersion, priceCents: offer.priceCents, attemptId: id }),
      })
      if (res.status === 409) {
        attempts.current.delete(storageKey)
        try { sessionStorage.removeItem(storageKey) } catch {}
        setChanged(true)
        throw new Error('This selection has changed. Reload the available formats to continue.')
      }
      if (!res.ok) throw new Error('Checkout could not start. Please try again.')
      const { orderId } = await res.json()
      if (!orderId) throw new Error('Checkout could not start. Please try again.')
      try { sessionStorage.removeItem(storageKey) } catch {}
      window.location.replace('/checkout?orderId=' + encodeURIComponent(orderId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.')
      submitting.current = false
      setBusy(false)
    }
  }

  return <main className="mx-auto max-w-2xl px-4 py-10">
    <Link className="text-sm font-semibold text-amber-800" href={'/personalize/' + encodeURIComponent(story)}>← Back to story</Link>
    <section className="mt-4 rounded-2xl border border-amber-100 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-center gap-4">
        <Image src={cover} width={84} height={84} alt="" className="size-[84px] rounded-lg object-cover" />
        <div><h1 className="font-title text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-600">Original illustrations and character names · English</p></div>
      </div>
      <fieldset disabled={busy || changed} className="mt-6 space-y-2">
        <legend className="mb-2 font-semibold">Choose your format</legend>
        {formats.map(({ id, label, detail }) => {
          const row = offers.find(item => item.format === id)
          if (!row) return null
          return <label key={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 px-4 py-3 has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50">
            <input type="radio" name="format" checked={format === id} onChange={() => select(id)} className="accent-amber-600" />
            <span className="min-w-0 flex-1"><strong className="block">{label}</strong><span className="text-sm text-slate-600">{detail}</span></span>
            <span className="font-semibold">{formatCurrencyAmount(row.priceCents / 100, displayCurrency)}</span>
          </label>
        })}
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {changed ? <button onClick={() => window.location.reload()} className="mt-3 underline">Reload formats</button> :
        <button disabled={!offer || busy} onClick={start} className="mt-5 w-full rounded-full bg-amber-500 px-5 py-3 font-bold text-stone-950 disabled:opacity-50">
          {busy ? 'Opening checkout…' : 'Continue to checkout'}
        </button>}
    </section>
  </main>
}
