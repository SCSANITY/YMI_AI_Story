'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AdminButton, AdminNotice, adminFieldClass, adminLabelClass } from '@/components/admin/AdminUi'
import { isOrderRow, type OrderRow } from './types'
import type { AdminShippingDetails } from '@/lib/order-shipping'

export function OrderShippingWorkspace({order,blocked,onCommitted}:{order:OrderRow;blocked:boolean;onCommitted:(order:OrderRow)=>void}) {
  const [data,setData]=useState<AdminShippingDetails|null>(null)
  const [provider,setProvider]=useState(false)
  const [autoDelivery,setAutoDelivery]=useState(false)
  const [description,setDescription]=useState('')
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState<string|null>(null)
  const intent=useRef(0)
  const manualKey=useRef<string|null>(null)
  const endpoint=`/api/admin/orders/${order.order_id}/shipping`
  const shippingDraftDirty=Boolean(data&&(provider!==(data.provider==='dealer_send')||autoDelivery!==data.autoDelivery||description.trim()))

  const load=useCallback(async()=>{
    const current=++intent.current
    try {
      const response=await fetch(endpoint,{credentials:'include',cache:'no-store'})
      const result=await response.json()
      if (current!==intent.current) return
      if (!response.ok) throw new Error(result.error||'Shipping details unavailable')
      const next=result.shipping as AdminShippingDetails
      setData(next);setProvider(next.provider==='dealer_send');setAutoDelivery(next.autoDelivery);setNotice(null)
    } catch(error) {
      if (current===intent.current) setNotice(error instanceof Error?error.message:'Shipping details unavailable')
    }
  },[endpoint])

  useEffect(()=>{
    void load()
    return()=>{
      // This is a request-generation counter, not a DOM ref: invalidate late responses.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      intent.current++
    }
  },[load,order.logistics_updated_at])

  const action=async(kind:'save'|'sync'|'retry_email')=>{
    if (!data||busy||blocked||(kind!=='save'&&shippingDraftDirty)) return
    const current=++intent.current
    setBusy(true);setNotice(null)
    try {
      if (description.trim()&&!manualKey.current) manualKey.current=crypto.randomUUID()
      const response=await fetch(endpoint,{method:kind==='save'?'PATCH':'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(kind==='save'?{
          expectedStatus:data.orderStatus,expectedUpdatedAt:data.logisticsUpdatedAt,expectedRevision:data.revision,
          provider:provider?'dealer_send':null,autoDelivery,
          ...(description.trim()?{manualEvent:{key:`manual:${manualKey.current}`,description:description.trim(),time:new Date().toISOString(),country:null}}:{}),
        }:{action:kind})})
      const result=await response.json()
      if (current!==intent.current) return
      if (!response.ok) throw new Error(result.error||'Shipping action failed')
      const next=result.shipping as AdminShippingDetails|null
      if (next) {setData(next);setProvider(next.provider==='dealer_send');setAutoDelivery(next.autoDelivery)}
      else setData(null)
      if (kind==='save') {setDescription('');manualKey.current=null}
      if (isOrderRow(result.order)) onCommitted(result.order)
      setNotice(result.refreshRequired?'Changes saved; reload shipping details before further edits.':
        result.result?.errorCode?'Sync did not complete; previous information was retained.':
        result.result?.skipped?'No sync started: check configuration, order stage, binding or refresh cooldown.':
        result.result?.emailStatus==='failed'?'Delivery confirmed; notification needs retry.':'Shipping action completed.')
    } catch(error) {if (current===intent.current) setNotice(error instanceof Error?error.message:'Shipping action failed')}
    finally {setBusy(false)}
  }

  return (
    <section aria-label="Shipping details administration" className="mt-5 border-t border-[var(--admin-card-line)] pt-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Shipping Details</h3>
        <AdminButton type="button" tone="quiet" disabled={busy} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Reload</AdminButton>
      </div>
      {data?(
        <fieldset disabled={busy||blocked} className="mt-3 space-y-3">
          {blocked?<p className="text-xs">Save or discard the order draft before editing shipping details.</p>:null}
          <label className="flex min-h-11 items-center gap-2 text-sm"><input className="h-4 w-4 shrink-0" type="checkbox" checked={provider} onChange={(event)=>setProvider(event.target.checked)}/>Use Dealer Send for this tracking number</label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input className="h-4 w-4 shrink-0" type="checkbox" checked={autoDelivery} disabled={!provider} onChange={(event)=>setAutoDelivery(event.target.checked)}/>Allow automatic Delivered confirmation</label>
          <p className="text-xs text-[var(--admin-page-muted)]">Status or carrier/tracking/provider changes pause automatic confirmation. Save the new binding first, then explicitly resume. Only verified carrier codes can confirm delivery.</p>
          {!data.configurationReady?<p className="text-xs">Provider sync is not configured or enabled.</p>:null}
          {!data.deliveryMappingsReady?<p className="text-xs">No verified delivery mapping is active; delivery remains manual.</p>:null}
          {shippingDraftDirty?<p className="text-xs">Save shipping changes before syncing or retrying notifications.</p>:null}
          <label className={adminLabelClass}>Manual progress update
            <textarea value={description} maxLength={500} onChange={(event)=>{setDescription(event.target.value);manualKey.current=null}}
              className={`${adminFieldClass} mt-1 min-h-20`} placeholder="Optional customer-visible operations update; does not change Order Status"/>
          </label>
          <div className="flex flex-wrap gap-2">
            <AdminButton type="button" tone="primary" onClick={()=>void action('save')}>Save shipping settings / update</AdminButton>
            <AdminButton type="button" tone="quiet" disabled={shippingDraftDirty||!data.provider||!data.configurationReady} onClick={()=>void action('sync')}>Sync now</AdminButton>
            <AdminButton type="button" tone="quiet" disabled={shippingDraftDirty||!data.notificationPending} onClick={()=>void action('retry_email')}>Retry delivery email</AdminButton>
          </div>
          {data.lastSyncedAt?<p className="text-xs">Last successful sync: {data.lastSyncedAt}</p>:null}
          {data.errorCode?<p className="text-xs">Sync needs attention: {data.errorCode}. Known events are retained.</p>:null}
          {data.events.length?<ol className="max-h-64 space-y-2 overflow-y-auto text-xs">{data.events.map((event)=>(<li key={event.id} className="break-words rounded-lg border border-[var(--admin-card-line)] p-2">
            <p>{event.description}</p><p className="mt-1 text-[var(--admin-page-muted)]">{event.source==='manual'?'Operations':'Carrier'}{event.time?` · ${event.time}`:''}{event.country?` · ${event.country}`:''}</p>
          </li>))}</ol>:<p className="text-xs">No detailed shipping events received.</p>}
        </fieldset>
      ):null}
      {notice?<AdminNotice tone="info" role="status" className="mt-3">{notice}</AdminNotice>:null}
    </section>
  )
}
