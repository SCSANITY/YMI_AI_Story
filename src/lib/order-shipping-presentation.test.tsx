import React from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShippingDetailsPanel } from '../../app/orders/[orderID]/ShippingDetailsPanel'
import type { ShippingDetails } from './order-shipping'
import { LogisticsTracker } from '../../app/orders/[orderID]/LogisticsTracker'
import { ShippingLocationMap } from '../../app/orders/[orderID]/ShippingLocationMap'
import { createOrderDetailReadModel } from '../../app/orders/[orderID]/orderDetailModel'

test('empty shipping history is expandable with a calm fallback and support access',()=>{
  const html=renderToStaticMarkup(<ShippingDetailsPanel details={null}/>)
  assert.match(html,/<details/);assert.match(html,/<summary[^>]*>Shipping Details/)
  assert.match(html,/contact support/);assert.doesNotMatch(html,/<ol|Delivery guaranteed/)
})

test('API response survives page projection and reaches the real customer tracker',()=>{
  const apiOrder={order_id:'SYNTHETIC',order_status:'shipped',tracking_number:'SYNTHETIC-NOT-A-WAYBILL',item_count:2,
    shipping_details:{provider:'dealer_send' as const,lastSyncedAt:'2026-09-16T10:00:00Z',unavailable:false,events:[
      {id:'scan',source:'dealer_send' as const,time:'2026-09-16T09:00:00',country:'GB',description:'Synthetic customs scan',recordedAt:'2026-09-16T10:00:00Z'}]},
    privateCarrierPayload:'must not propagate'}
  const model=createOrderDetailReadModel(apiOrder)
  assert.equal(model.shipping_details,apiOrder.shipping_details)
  assert.equal(model.item_count,2);assert.deepEqual(model.items,[])
  assert.ok(!('privateCarrierPayload' in model))
  const html=renderToStaticMarkup(<LogisticsTracker status={model.order_status!} trackingNumber={model.tracking_number} shippingDetails={model.shipping_details}/>)
  assert.match(html,/Synthetic customs scan/);assert.match(html,/Official shipment lookup/)
  assert.match(html,/https:\/\/apiv2.dealer-send.com\/en\/Tracking/)
  assert.doesNotMatch(html,/Latest recorded region|<figure/)
})

test('country map keeps the last recorded region during an outage and does not invent movement',()=>{
  const details:ShippingDetails={lastSyncedAt:null,unavailable:true,events:[
    {id:'scan',source:'dealer_send',time:'2026-09-16T09:00:00',country:'GB',description:'Synthetic',recordedAt:'2026-09-16T10:00:00Z'}]}
  const html=renderToStaticMarkup(<ShippingLocationMap details={details}/>)
  assert.match(html,/United Kingdom/);assert.match(html,/not live GPS/)
  assert.match(html,/viewBox="0 0 720 320"/);assert.match(html,/role="img"/)
  assert.doesNotMatch(html,/delivery guaranteed|<animate|<image|http/)
  assert.equal(renderToStaticMarkup(<ShippingLocationMap details={{...details,events:[]}}/>),'')
  const unknown=renderToStaticMarkup(<ShippingLocationMap details={{...details,events:[{...details.events[0],country:'ZZ'}]}}/>)
  assert.match(unknown,/not available/);assert.doesNotMatch(unknown,/<svg/)
})

test('equivalent API history hides redundant lookup, but missing history and outages keep it',()=>{
  const details:ShippingDetails={provider:'dealer_send',officialTrackingCoverage:'equivalent',lastSyncedAt:'2026-09-16T10:00:00Z',unavailable:false,
    events:[{id:'scan',source:'dealer_send',time:null,country:null,description:'Synthetic scan',recordedAt:'2026-09-16T10:00:00Z'}]}
  const render=(state:ShippingDetails)=>renderToStaticMarkup(<ShippingDetailsPanel details={state} trackingNumber="SYNTHETIC"/>)
  assert.doesNotMatch(render(details),/Official shipment lookup/)
  assert.match(render({...details,unavailable:true}),/Official shipment lookup/)
  assert.match(render({...details,events:[]}),/Official shipment lookup/)
  const paid=renderToStaticMarkup(<LogisticsTracker status="paid" trackingNumber="SYNTHETIC" shippingDetails={details}/>)
  assert.doesNotMatch(paid,/Shipping Details|Official shipment lookup/)
})

test('outages retain known carrier and separately attributed manual updates',()=>{
  const details:ShippingDetails={lastSyncedAt:'2026-09-16T00:00:00Z',unavailable:true,events:[
    {id:'1',source:'dealer_send',time:'2026-09-15T12:00:00',country:'GB',description:'Customs scan <script>',recordedAt:'2026-09-16T00:00:00Z'},
    {id:'2',source:'manual',time:'2026-09-16T08:00:00+08:00',country:null,description:'Operations contacted the carrier',recordedAt:'2026-09-16T00:00:00Z'}]}
  const html=renderToStaticMarkup(<ShippingDetailsPanel details={details}/>)
  assert.match(html,/Last checked/);assert.match(html,/UTC/);assert.match(html,/Carrier local time: 2026-09-15 12:00:00/)
  assert.match(html,/Operations update/);assert.match(html,/Operations contacted/)
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)
  assert.match(html,/role="status"/);assert.match(html,/Shipping updates/)
})
