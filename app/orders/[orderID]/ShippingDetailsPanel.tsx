'use client'

import { lazy, Suspense, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { shippingFallback, type ShippingDetails } from '@/lib/order-shipping'
import { shippingTrackingEntry } from '@/lib/dealer-send-public-tracking'
import Link from 'next/link'

const ShippingLocationMap = lazy(() => import('./ShippingLocationMap').then(module => ({ default: module.ShippingLocationMap })))

function readableTime(value:string) { return value.replace('T',' ').replace(/Z$/,' UTC') }

export function ShippingDetailsPanel({details,trackingUrl,trackingNumber,trackingCarrier}:{
  details?:ShippingDetails|null
  trackingUrl?:string|null
  trackingNumber?:string|null
  trackingCarrier?:string|null
}) {
  const [expanded,setExpanded]=useState(false)
  const fallback=shippingFallback(details)
  const entry=shippingTrackingEntry({details,trackingUrl,trackingNumber,trackingCarrier})
  return (
    <details onToggle={event=>setExpanded(event.currentTarget.open)} className="rounded-2xl border border-amber-100 bg-white/80 p-4">
      <summary className="cursor-pointer rounded-lg text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-orange-500">
        Shipping Details
      </summary>
      <div className="mt-4 space-y-3 text-sm text-slate-600">
        <p className="text-xs">Updates are provided by the carrier and may be limited between international scans.</p>
        {details?.lastSyncedAt ? <p className="text-xs">Last checked: <time dateTime={details.lastSyncedAt}>{readableTime(details.lastSyncedAt)}</time></p> : null}
        {fallback ? <p role="status" className="rounded-xl bg-amber-50 p-3">{fallback}</p> : null}
        {expanded && details?.events.some(event=>event.source==='dealer_send' && /^[a-z]{2}$/i.test(event.country?.trim()??'')) ? (
          <Suspense fallback={<div className="aspect-[9/4] rounded-2xl bg-amber-50/40" aria-label="Loading region map" />}>
            <ShippingLocationMap details={details}/>
          </Suspense>
        ):null}
        {details?.events.length ? (
          <ol aria-label="Shipping updates" className="space-y-3 border-l border-orange-200 pl-4">
            {details.events.map((event)=>(
              <li key={event.id} className="break-words">
                <p className="font-medium text-slate-800">{event.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {event.source==='manual'?'Operations update':'Carrier update'}
                  {event.country?` · ${event.country}`:''}
                </p>
                {event.time ? <p className="text-xs text-slate-500">{event.source==='manual'?'Update time':'Carrier local time'}: {readableTime(event.time)}</p>:null}
              </li>
            ))}
          </ol>
        ):null}
        <div className="space-y-2 border-t border-amber-100 pt-3">
          {entry ? <>
            <a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-xs font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-orange-500">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true"/>Official shipment lookup
            </a>
            {entry.generic ? <p className="text-xs">Enter the tracking number shown above on the official tracking page.</p>:null}
          </>:null}
          <p className="text-xs">Need help with your shipment? <Link href="/support" className="font-semibold text-orange-700 underline">contact support</Link>.</p>
        </div>
      </div>
    </details>
  )
}
