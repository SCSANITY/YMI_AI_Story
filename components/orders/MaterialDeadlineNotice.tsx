import type {OrderMaterials} from '@/lib/order-materials'
import {MaterialTime} from '@/components/orders/MaterialTime'
export function MaterialDeadlineNotice({materials}:{materials:OrderMaterials}){
  const open=materials.items.some(item=>item.can_edit_dedication)
  const voice=materials.items.some(item=>item.package_type==='supreme')
  const missing=materials.items.some(item=>item.package_type==='supreme'&&!item.voice_ready)
  return <p className="text-sm leading-6">{open?<>You can update your message{voice?' and recording':''} until <MaterialTime value={materials.dedication_deadline}/>.</>
    :<>The update deadline has passed: <MaterialTime value={materials.dedication_deadline}/>. Your message{voice&&!missing?' and recording are':' is'} final.</>}</p>
}
