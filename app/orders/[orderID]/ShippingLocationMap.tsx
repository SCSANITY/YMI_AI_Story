import { useId } from 'react'
import type { ShippingDetails } from '@/lib/order-shipping'
import { latestCarrierRegion } from '@/lib/shipping-map'
import { SHIPPING_WORLD_LAND_PATH } from '@/lib/shipping-world-map'

export function ShippingLocationMap({ details }: { details: ShippingDetails }) {
  const titleId = useId()
  const region = latestCarrierRegion(details.events)
  if (!region) return null
  return (
    <figure className="overflow-hidden rounded-2xl border border-amber-100 bg-amber-50/40">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest recorded region</span>
        <span className="text-sm font-semibold text-slate-800">{region.name}</span>
      </figcaption>
      {region.anchor ? (
        <svg viewBox="0 0 720 320" role="img" aria-labelledby={titleId} className="block aspect-[9/4] w-full">
          <title id={titleId}>{`Saved carrier scan in ${region.name}. Approximate country location, not live GPS.`}</title>
          <path d={SHIPPING_WORLD_LAND_PATH} fill="#e8dfcf" stroke="#fffaf2" strokeWidth="0.5" fillRule="evenodd" />
          <g transform={`translate(${region.anchor.x} ${region.anchor.y})`}>
            <circle r="19" fill="#ff9800" opacity="0.14" />
            <circle r="12" fill="#ff8800" stroke="white" strokeWidth="2" />
            <path d="M-5-4H5V5H-5ZM-5-1H5M0-4V-1" fill="none" stroke="white" strokeWidth="1.3" strokeLinejoin="round" />
          </g>
        </svg>
      ) : <p className="px-4 py-4 text-xs text-slate-500">A map location is not available for this reported country.</p>}
      <p className="px-4 pb-4 text-xs leading-relaxed text-slate-500">
        Based on saved carrier scans. Approximate region only, not live GPS or a delivery estimate.
        {region.event.time ? <> Carrier local time: {region.event.time.replace('T', ' ')}.</> : null}
      </p>
    </figure>
  )
}
