'use client'
import {useSyncExternalStore} from 'react'
import {formatMaterialTime,MATERIAL_UI_LANGUAGE} from '@/lib/order-materials-client'
const subscribe=()=>()=>{}
const deviceZone=()=>new Intl.DateTimeFormat(MATERIAL_UI_LANGUAGE).resolvedOptions().timeZone
export function useDeviceTimeZone(){return useSyncExternalStore(subscribe,deviceZone,()=>null)}
export function MaterialTime({value}:{value:string}){
  const zone=useDeviceTimeZone()
  return <time dateTime={value}>{zone?formatMaterialTime(value,zone):'Loading local time...'}</time>
}
