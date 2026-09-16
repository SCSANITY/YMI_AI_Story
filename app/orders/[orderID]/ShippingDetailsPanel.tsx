import { shippingFallback, type ShippingDetails } from '@/lib/order-shipping'
import Link from 'next/link'

function readableTime(value:string) { return value.replace('T',' ').replace(/Z$/,' UTC') }

export function ShippingDetailsPanel({details}:{details?:ShippingDetails|null}) {
  const fallback=shippingFallback(details)
  return (
    <details className="rounded-2xl border border-amber-100 bg-white/80 p-4">
      <summary className="cursor-pointer rounded-lg text-sm font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-orange-500">
        Shipping Details
      </summary>
      <div className="mt-4 space-y-3 text-sm text-slate-600">
        <p className="text-xs">Updates are provided by the carrier and may be limited between international scans.</p>
        {details?.lastSyncedAt ? <p className="text-xs">Last checked: <time dateTime={details.lastSyncedAt}>{readableTime(details.lastSyncedAt)}</time></p> : null}
        {fallback ? <p role="status" className="rounded-xl bg-amber-50 p-3">{fallback}</p> : null}
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
        <p className="text-xs">Use the shipment tracking link when available, or <Link href="/support" className="font-semibold text-orange-700 underline">contact support</Link>.</p>
      </div>
    </details>
  )
}
