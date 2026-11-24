import Link from 'next/link'
import type {OrderMaterials} from '@/lib/order-materials'
import {distinctMaterialNames,isMaterialOrderShipped,type MaterialShipment} from '@/lib/order-materials-client'
import {MaterialShippedNotice} from '@/components/orders/MaterialShippedNotice'
export function OrderMaterialsSummary({materials,shipment}:{materials?:OrderMaterials|null;shipment?:MaterialShipment}) {
  if(isMaterialOrderShipped(shipment))return <MaterialShippedNotice/>
  if(!materials)return null
  const dedicationItems=materials.items.filter(item=>item.package_type!=='digital' && item.edition!=='original')
  if(!dedicationItems.length) {
    if(!materials.items.some(item=>item.package_type==='supreme')) return null
    return <Link className="text-sm font-semibold underline" href={`/orders/${materials.order_id}/materials`}>Manage your optional recording</Link>
  }
  const names=distinctMaterialNames(dedicationItems)
  return <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-left" aria-label="Book materials">
    <h2 className="font-serif text-lg font-bold">Your book&apos;s personal touches</h2>
    <p className="mt-2 text-sm">Your message for {names.length?names.map((name,index)=><span key={name}>{index>0?(index===names.length-1?' and ':', '):''}<bdi>{name}</bdi></span>):<bdi>this book</bdi>} is optional.</p>
    {materials.items.filter(item=>item.package_type==='supreme'&&!item.voice_ready).map(item=><p key={item.cart_item_id} className="mt-2 text-sm font-semibold text-amber-900">
      <bdi>{item.child_name||'This book'}</bdi>: Please submit your recording so we can finish your Hardcover + Voice book.
    </p>)}
    <Link className="mt-3 inline-block rounded-full bg-amber-800 px-5 py-3 text-sm font-bold text-white" href={`/orders/${materials.order_id}/materials`}>Review or update your materials</Link>
  </section>
}
