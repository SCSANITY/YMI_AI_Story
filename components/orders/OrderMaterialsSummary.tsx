import Link from 'next/link'
import type { OrderMaterials } from '@/lib/order-materials'

export function OrderMaterialsSummary({materials}:{materials?:OrderMaterials|null}) {
  if (!materials) return null
  const pendingVoice=materials.items.filter(item=>item.can_submit_voice).length
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-left" aria-label="Book materials">
    <h2 className="font-serif text-lg font-bold">Your book&apos;s personal touches</h2>
    <p className="mt-2 text-sm leading-6">Dedication is optional. Add or edit it by {new Date(materials.dedication_deadline).toUTCString()}.</p>
    {pendingVoice ? <p className="mt-2 text-sm font-semibold text-amber-900">Please provide your recording as soon as possible. Missing recordings delay completion of your Hardcover + Voice book.</p> : null}
    <Link className="mt-3 inline-block rounded-full bg-amber-800 px-5 py-3 text-sm font-bold text-white" href={`/orders/${materials.order_id}/materials`}>Add or review your materials</Link>
  </section>
}
