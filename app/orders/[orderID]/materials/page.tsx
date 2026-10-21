import { notFound } from 'next/navigation'
import { OrderMaterialsClient } from '@/components/orders/OrderMaterialsClient'
import { isUuid } from '@/lib/validators'
export const dynamic='force-dynamic'
export const metadata={title:'Your book materials | YMI Story',referrer:'no-referrer',robots:{index:false,follow:false}} as const
export default async function MaterialsPage({params}:{params:Promise<{orderID:string}>}) {
  const {orderID}=await params
  if (!isUuid(orderID)) notFound()
  return <OrderMaterialsClient orderId={orderID}/>
}
