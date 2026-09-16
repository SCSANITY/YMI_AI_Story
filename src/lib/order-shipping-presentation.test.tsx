import React from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShippingDetailsPanel } from '../../app/orders/[orderID]/ShippingDetailsPanel'
import type { ShippingDetails } from './order-shipping'

test('empty shipping history is expandable with a calm fallback and support access',()=>{
  const html=renderToStaticMarkup(<ShippingDetailsPanel details={null}/>)
  assert.match(html,/<details/);assert.match(html,/<summary[^>]*>Shipping Details/)
  assert.match(html,/contact support/);assert.doesNotMatch(html,/<ol|Delivery guaranteed/)
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
